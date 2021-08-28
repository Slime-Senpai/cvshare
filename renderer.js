/* globals request */

const form = document.querySelector('#formBox form');

form.addEventListener('submit', event => {
  event.preventDefault();

  const data = new window.FormData(form);

  const arg = {};

  for (const value of data.entries()) {
    arg[value[0]] = value[1];
  }

  request.sendFormData(arg);
});
