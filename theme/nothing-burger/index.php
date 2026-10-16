<?php
get_header();

if ( have_posts() ) :
	while ( have_posts() ) :
		the_post();
		?>
		<article <?php post_class( 'nb-article' ); ?>>
			<h1><a href="<?php the_permalink(); ?>"><?php the_title(); ?></a></h1>
			<div class="nb-meta"><?php echo esc_html( get_the_date() ); ?></div>
			<div class="nb-content">
				<?php the_content(); ?>
			</div>
		</article>
		<?php
	endwhile;
else :
	?>
	<p>No posts found.</p>
	<?php
endif;

get_footer();
