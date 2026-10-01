// Carregado no <head> (sem defer) para aplicar o tema antes da primeira pintura.
(function () {
  var CHAVE = 'tema';
  var raiz = document.documentElement;

  function lerPreferencia() {
    try {
      return localStorage.getItem(CHAVE);
    } catch (e) {
      return null;
    }
  }

  function sistemaEscuro() {
    return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
  }

  function aplicar(escuro) {
    raiz.classList.toggle('dark', escuro);
    raiz.style.colorScheme = escuro ? 'dark' : 'light';
  }

  var salvo = lerPreferencia();
  aplicar(salvo ? salvo === 'dark' : sistemaEscuro());

  function sincronizarBotoes() {
    var escuro = raiz.classList.contains('dark');
    document.querySelectorAll('[data-alternar-tema]').forEach(function (btn) {
      btn.setAttribute('aria-pressed', escuro ? 'true' : 'false');
      btn.setAttribute('aria-label', escuro ? 'Usar tema claro' : 'Usar tema escuro');
      btn.title = escuro ? 'Tema claro' : 'Tema escuro';
      var icone = btn.querySelector('[data-icone-tema]');
      if (icone) icone.textContent = escuro ? '☀' : '☾';
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    sincronizarBotoes();
    document.querySelectorAll('[data-alternar-tema]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var escuro = !raiz.classList.contains('dark');
        aplicar(escuro);
        try {
          localStorage.setItem(CHAVE, escuro ? 'dark' : 'light');
        } catch (e) {
          /* armazenamento indisponivel: o tema vale so nesta visita */
        }
        sincronizarBotoes();
      });
    });
  });
})();
