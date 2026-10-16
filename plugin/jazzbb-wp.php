<?php
/**
 * Plugin Name: jazzbb-wp
 * Description: A Tiptap Markdown editor for new posts and pages, with HTML for WordPress rendering.
 * Version: 0.1.0
 * Requires at least: 6.4
 * Requires PHP: 8.0
 * Author: jazzbb
 * License: GPL-2.0-or-later
 * License URI: https://www.gnu.org/licenses/old-licenses/gpl-2.0.html
 */

if ( ! defined( 'ABSPATH' ) ) {
	exit;
}

const JAZZBB_WP_VERSION  = '0.1.0';
const JAZZBB_WP_META_KEY = '_jazzbb_markdown';

add_action( 'init', 'jazzbb_wp_register_meta' );
add_filter( 'use_block_editor_for_post', 'jazzbb_wp_use_block_editor', 100, 2 );
add_action( 'admin_enqueue_scripts', 'jazzbb_wp_enqueue_assets' );
add_action( 'edit_form_after_title', 'jazzbb_wp_render_editor_mount' );
add_action( 'save_post', 'jazzbb_wp_save_markdown', 10, 3 );
add_filter( 'wp_insert_post_data', 'jazzbb_wp_inject_post_content', 10, 2 );
add_action( 'add_meta_boxes', 'jazzbb_wp_add_outline_metabox', 10, 2 );

function jazzbb_wp_assets_exist(): bool {
	return is_file( __DIR__ . '/build/admin.js' ) && is_file( __DIR__ . '/build/admin.css' );
}

/** Existing non-Markdown content keeps its native editor; no implicit conversion. */
function jazzbb_wp_eligible( $post ): bool {
	return $post instanceof WP_Post
		&& in_array( $post->post_type, [ 'post', 'page' ], true )
		&& ( metadata_exists( 'post', $post->ID, JAZZBB_WP_META_KEY ) || '' === $post->post_content );
}

function jazzbb_wp_use_block_editor( bool $use, WP_Post $post ): bool {
	return jazzbb_wp_eligible( $post ) && ( jazzbb_wp_assets_exist() || metadata_exists( 'post', $post->ID, JAZZBB_WP_META_KEY ) ) ? false : $use;
}

/** Use WordPress 6.4+ revisioned metadata, including empty values and restores. */
function jazzbb_wp_register_meta(): void {
	foreach ( [ 'post', 'page' ] as $post_type ) {
		register_post_meta(
			$post_type,
			JAZZBB_WP_META_KEY,
			[
				'type'              => 'string',
				'single'            => true,
				'show_in_rest'      => true,
				'revisions_enabled' => true,
				'auth_callback'     => static fn ( $allowed, $key, $post_id ) => current_user_can( 'edit_post', $post_id ),
				'sanitize_callback' => static fn ( $value ) => is_string( $value ) ? wp_kses( $value, jazzbb_wp_allowed_embed_html() ) : '',
				'default'           => '',
			]
		);
	}
}

function jazzbb_wp_enqueue_assets( string $hook ): void {
	global $post;
	if ( ! in_array( $hook, [ 'post.php', 'post-new.php' ], true ) || ! jazzbb_wp_eligible( $post ) ) {
		return;
	}
	if ( ! jazzbb_wp_assets_exist() ) {
		add_action( 'admin_notices', static function () {
			echo '<div class="notice notice-warning"><p>jazzbb-wp assets are missing. Run npm run build. The native editor remains available.</p></div>';
		} );
		return;
	}

	wp_enqueue_media();
	wp_enqueue_style( 'jazzbb-wp-admin', plugins_url( 'build/admin.css', __FILE__ ), [], (string) filemtime( __DIR__ . '/build/admin.css' ) );
	wp_enqueue_script( 'jazzbb-wp-admin', plugins_url( 'build/admin.js', __FILE__ ), [], (string) filemtime( __DIR__ . '/build/admin.js' ), true );
	wp_localize_script( 'jazzbb-wp-admin', 'jazzbbWpData', [
		'restUrl' => esc_url_raw( rest_url() ),
		'nonce' => wp_create_nonce( 'wp_rest' ),
		'markdown' => (string) get_post_meta( $post->ID, JAZZBB_WP_META_KEY, true ),
		'postId' => $post->ID,
		'userId' => get_current_user_id(),
	] );
}

/** Disabled unnamed fields cannot erase content if JavaScript fails to initialize. */
function jazzbb_wp_render_editor_mount( WP_Post $post ): void {
	if ( ! jazzbb_wp_assets_exist() || ! jazzbb_wp_eligible( $post ) || ! current_user_can( 'edit_post', $post->ID ) ) {
		return;
	}
	wp_nonce_field( 'jazzbb_wp_save', 'jazzbb_wp_nonce' );
	echo '<div id="jazzbb-wp-editor-root"></div>';
	echo '<textarea id="jazzbb-wp-markdown" disabled hidden></textarea>';
	echo '<textarea id="jazzbb-wp-html" disabled hidden></textarea>';
}

/** Form and REST paths use the same metadata sanitizer. Never unslash twice. */
function jazzbb_wp_save_markdown( int $post_id, WP_Post $post, bool $is_update ): void {
	if ( wp_is_post_revision( $post_id ) || ! current_user_can( 'edit_post', $post_id ) || ! jazzbb_wp_submission_valid() ) {
		return;
	}
	$markdown = wp_unslash( $_POST['jazzbb_markdown'] ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified in jazzbb_wp_submission_valid().
	update_post_meta( $post_id, JAZZBB_WP_META_KEY, wp_slash( $markdown ) );
}

function jazzbb_wp_inject_post_content( array $data, array $postarr ): array {
	$post_id = (int) ( $postarr['ID'] ?? 0 );
	// An incomplete editor must not replace HTML while leaving stale Markdown behind.
	// WordPress has already checked the ordinary edit-post nonce on this form path.
	if ( $post_id && current_user_can( 'edit_post', $post_id )
		&& metadata_exists( 'post', $post_id, JAZZBB_WP_META_KEY )
		&& isset( $_POST['action'] ) && 'editpost' === $_POST['action']
		&& ! jazzbb_wp_submission_valid() ) {
		wp_die( 'The Markdown editor was not ready. Rebuild its assets and reload before saving. Your saved post is unchanged.', 'Editor unavailable', [ 'response' => 400, 'back_link' => true ] );
	}
	if ( $post_id && current_user_can( 'edit_post', $post_id ) && jazzbb_wp_submission_valid() ) {
		$data['post_content'] = wp_slash( wp_kses( wp_unslash( $_POST['jazzbb_html'] ), jazzbb_wp_allowed_embed_html() ) ); // phpcs:ignore WordPress.Security.NonceVerification.Missing -- verified in jazzbb_wp_submission_valid().
	}
	return $data;
}

function jazzbb_wp_submission_valid(): bool {
	if ( ! isset( $_POST['jazzbb_wp_nonce'], $_POST['jazzbb_markdown'], $_POST['jazzbb_html'] )
		|| ! is_string( $_POST['jazzbb_wp_nonce'] ) || ! is_string( $_POST['jazzbb_markdown'] ) || ! is_string( $_POST['jazzbb_html'] ) ) {
		return false;
	}
	return (bool) wp_verify_nonce( sanitize_text_field( wp_unslash( $_POST['jazzbb_wp_nonce'] ) ), 'jazzbb_wp_save' );
}

function jazzbb_wp_add_outline_metabox( string $post_type, WP_Post $post ): void {
	if ( ! jazzbb_wp_assets_exist() || ! jazzbb_wp_eligible( $post ) ) {
		return;
	}
	add_meta_box( 'jazzbb_wp_outline', 'Outline', static function () {
		echo '<div id="jazzbb-wp-outline"><p class="jazzbb-wp-outline-empty">No headings yet</p><ul id="jazzbb-wp-outline-list" role="list"></ul></div>';
	}, $post_type, 'side', 'high' );
}

/** Standard post HTML plus embeds for trusted local authors; no script attributes. */
function jazzbb_wp_allowed_embed_html(): array {
	$allowed = wp_kses_allowed_html( 'post' );
	$allowed['iframe'] = array_fill_keys( [ 'src', 'title', 'width', 'height', 'frameborder', 'allow', 'allowfullscreen', 'referrerpolicy' ], true );
	return $allowed;
}
