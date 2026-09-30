// Histórico de leitura guardado no navegador (localStorage): últimos livros abertos
// e a posição de leitura de cada um. Não vai para o servidor.
(function () {
  var CHAVE = 'sebo:historico';
  var MAX_ITENS = 12;

  function ler() {
    try {
      var bruto = JSON.parse(localStorage.getItem(CHAVE) || '[]');
      return Array.isArray(bruto) ? bruto : [];
    } catch (e) {
      return [];
    }
  }

  function gravar(lista) {
    try {
      localStorage.setItem(CHAVE, JSON.stringify(lista.slice(0, MAX_ITENS)));
    } catch (e) {
      /* armazenamento cheio ou bloqueado: segue sem histórico */
    }
  }

  function encontrar(lista, id) {
    return lista.findIndex(function (item) {
      return String(item.id) === String(id);
    });
  }

  window.HistoricoLeitura = {
    listar: ler,

    registrar: function (livro) {
      var lista = ler();
      var i = encontrar(lista, livro.id);
      var anterior = i >= 0 ? lista.splice(i, 1)[0] : {};
      lista.unshift({
        id: livro.id,
        title: livro.title,
        authors: livro.authors || [],
        cover: livro.cover || null,
        progresso: anterior.progresso || 0,
        abertoEm: Date.now()
      });
      gravar(lista);
    },

    salvarProgresso: function (id, fracao) {
      var lista = ler();
      var i = encontrar(lista, id);
      if (i < 0) return;
      lista[i].progresso = Math.max(0, Math.min(1, fracao));
      gravar(lista);
    },

    progresso: function (id) {
      var lista = ler();
      var i = encontrar(lista, id);
      return i >= 0 ? lista[i].progresso || 0 : 0;
    },

    limpar: function () {
      gravar([]);
    }
  };
})();
