//pega todos os livros (divs com classe "item")
const itens = document.querySelectorAll('.item');
//pega o parágrafo onde mostra a descrção
const textoDescricao = document.getElementById("textoDescricao")
//para cada livro, adiciona um "ouvinte" de clique.
itens.forEach((item) => {
    item.addEventListener('click', () => {
        //lê o atributo data-descricao do livro clicado
        const descricao = item.getAttribute('data-descricao');
        //troca o texto na área de detalhes
        textoDescricao.textContent = descricao;

    })
});

//Dark Mode
const botaoDark = document.getElementById('dark');

//carregar preferencia salva do usuario ao abrir  a pagina
if (localStorage.getItem('tema')=== 'dark') {
    document.body.classList.add('dark');
    botaoDark.textContent = 'light Mode';
}

botaoDark.addEventListener('click', () => {
    document.body.classList.toggle('dark');
    if (document.body.classList.contains('dark')) {
        localStorage.setItem('tema','dark');
        botaoDark.textContent = 'Dark Mode'
    }
});

