const itens = document.querySelectorAll('.item');
const textoDescricao = document.getElementById('textoDescricao');
const botaoDark = document.getElementById('dark');
const TEMA_DARK = 'dark';

itens.forEach((item) => {
  item.addEventListener('click', () => {
    const descricao = item.getAttribute('data-descricao');
    textoDescricao.textContent = descricao;
  });
});

function atualizarTextoBotao() {
  const modoEscuroAtivo = document.body.classList.contains(TEMA_DARK);
  botaoDark.textContent = modoEscuroAtivo ? 'Light Mode' : 'Dark Mode';
}

if (localStorage.getItem('tema') === TEMA_DARK) {
  document.body.classList.add(TEMA_DARK);
}

atualizarTextoBotao();

botaoDark.addEventListener('click', () => {
  const modoEscuroAtivo = document.body.classList.toggle(TEMA_DARK);

  if (modoEscuroAtivo) {
    localStorage.setItem('tema', TEMA_DARK);
  } else {
    localStorage.removeItem('tema');
  }

  atualizarTextoBotao();
});
