<!doctype html>
<html <?php language_attributes(); ?>>
<head>
	<meta charset="<?php bloginfo( 'charset' ); ?>">
	<meta name="viewport" content="width=device-width, initial-scale=1">
	<?php wp_head(); ?>
</head>
<body <?php body_class(); ?>>
<?php wp_body_open(); ?>
<div class="nb-shell">
	<header class="nb-header">
		<div class="nb-brand">
			<h1 class="nb-title">
				<a href="<?php echo esc_url( home_url( '/' ) ); ?>">
					<?php echo esc_html( get_bloginfo( 'name' ) ?: 'Untitled' ); ?>
				</a>
			</h1>
			<?php
			$desc = get_bloginfo( 'description' );
			if ( $desc ) :
				?>
				<p class="nb-site-desc"><?php echo esc_html( $desc ); ?></p>
			<?php endif; ?>
		</div>
		<div class="nb-header-actions">
			<div class="nb-search" data-nb-search>
				<button class="nb-search-btn" type="button" aria-expanded="false" aria-label="Toggle search">
					<span aria-hidden="true">🔍</span>
				</button>
				<form class="nb-search-form" role="search" method="get" action="<?php echo esc_url( home_url( '/' ) ); ?>">
					<label class="nb-visually-hidden" for="nb-search-field">Search for:</label>
					<input
						class="nb-search-input"
						id="nb-search-field"
						type="search"
						name="s"
						placeholder="Search…"
						autocomplete="off"
					/>
				</form>
			</div>
		</div>
	</header>
