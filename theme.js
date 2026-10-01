// Light/dark toggle. Defaults to the system setting; a manual pick is remembered.
(function () {
    var root = document.documentElement;
    function current() {
        return root.dataset.theme ||
            (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    }
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
        btn.addEventListener('click', function () {
            var next = current() === 'dark' ? 'light' : 'dark';
            root.dataset.theme = next;
            try { localStorage.setItem('theme', next); } catch (e) {}
        });
    });
})();
