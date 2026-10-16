	<footer class="nb-footer">
	</footer>
</div>
<script>
	(() => {
		const root = document.querySelector('[data-nb-search]');
		if (!root) return;
		const button = root.querySelector('.nb-search-btn');
		const input = root.querySelector('.nb-search-input');
		if (!button || !input) return;

		const close = () => {
			root.classList.remove('is-open');
			button.setAttribute('aria-expanded', 'false');
		};

		button.addEventListener('click', () => {
			const open = root.classList.toggle('is-open');
			button.setAttribute('aria-expanded', open ? 'true' : 'false');
			if (open) {
				input.focus();
			}
		});

		document.addEventListener('keydown', (event) => {
			if (event.key === 'Escape') {
				close();
				button.focus();
			}
		});

		root.addEventListener('focusout', (event) => {
			if (!root.contains(event.relatedTarget)) {
				close();
			}
		});
	})();
</script>
<?php wp_footer(); ?>
</body>
</html>
