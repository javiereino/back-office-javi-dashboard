// Applies the saved theme before first paint (kept as a file so the strict CSP needs no inline scripts).
try { if (localStorage.getItem('pm.theme') === 'light') document.documentElement.classList.remove('dark') } catch (e) {}
