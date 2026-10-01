// Se o servidor não tem as chaves do Google, explica em vez de mandar para um login que falha.
fetch('/api/auth/me', { credentials: 'same-origin' })
  .then((r) => r.json())
  .then((data) => {
    if (data.loginDisponivel !== false) return;
    const botao = document.querySelector('.login-button');
    const aviso = document.createElement('p');
    aviso.className = 'status-msg status-msg--error';
    aviso.setAttribute('role', 'status');
    aviso.textContent =
      'O login com Google não está configurado neste servidor. O catálogo e o leitor funcionam normalmente sem login.';
    botao.replaceWith(aviso);
  })
  .catch(() => {});
