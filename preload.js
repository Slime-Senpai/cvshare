// All of the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.
window.addEventListener('DOMContentLoaded', () => {
  // sidebar
  const pages = document.querySelectorAll('.page');
  document.querySelectorAll('#sidebar a').forEach((value) => {
    value.addEventListener('click', e => {
      e.preventDefault();

      if (value.hasAttribute('disabled')) {
        return;
      }

      pages.forEach(p => {
        if (value.getAttribute('href') !== p.id) {
          p.style.display = 'none';
        } else {
          p.style.display = 'flex';
        }
      });
    });
  });

  document.querySelector('#props .refreshButton').addEventListener('click', e => {
    e.preventDefault();

    document.getElementById('propList').innerHTML = 'Loading...';

    ipcRenderer.send('propsRefresh', '');
  });

  document.querySelector('#props .saveButton').addEventListener('click', e => {
    e.preventDefault();

    ipcRenderer.send('propsSave', { props: selectedPropsList });
  });

  ipcRenderer.on('propsSaved', (event, arg) => {
    document.querySelector('#props .saveButton').style.backgroundColor = 'green';

    setTimeout(() => { document.querySelector('#props .saveButton').style.backgroundColor = 'rgb(0, 106, 228)'; }, 2000);
  });

  let selectedPropsList;

  ipcRenderer.on('propsRefreshList', (event, arg) => {
    document.getElementById('propList').innerHTML = '';
    selectedPropsList = [];
    for (const prop of arg) {
      const div = document.createElement('div');
      div.classList.add('prop');
      const image = document.createElement('img');
      image.src = prop.imgsrc;
      const name = document.createElement('p');
      name.innerHTML = prop.name;

      const selected = document.createElement('div');
      selected.innerHTML = 'Select';
      selected.classList.add('selectBox');

      if (prop.isSelected) {
        selected.setAttribute('selected', true);
        selectedPropsList.push(prop);
      }

      selected.addEventListener('click', e => {
        if (selected.hasAttribute('selected')) {
          selected.removeAttribute('selected');
        } else {
          selected.setAttribute('selected', true);
        }

        if (selected.hasAttribute('selected')) {
          selectedPropsList.push(prop);
        } else {
          selectedPropsList.splice(selectedPropsList.indexOf(prop), 1);
        }

        document.querySelector('a[href="props"] .count').innerHTML = selectedPropsList.length > 0 ? '(' + selectedPropsList.length + ')' : '';
        document.getElementById('propCount').innerHTML = selectedPropsList.length + ' prop' + (selectedPropsList.length > 1 ? 's' : '');
      });

      div.appendChild(image);
      div.appendChild(name);
      div.appendChild(selected);
      document.getElementById('propList').appendChild(div);
    }
  });

  document.querySelector('#friends .refreshButton').addEventListener('click', e => {
    e.preventDefault();

    document.getElementById('friendList').innerHTML = 'Loading...';

    ipcRenderer.send('friendsRefresh', '');
  });

  let selectedFriendsList;

  ipcRenderer.on('friendsRefreshList', (event, arg) => {
    document.getElementById('friendList').innerHTML = '';
    selectedFriendsList = [];
    for (const friend of arg) {
      const div = document.createElement('div');
      div.classList.add('friend');
      const image = document.createElement('img');
      image.src = friend.imgsrc;
      const name = document.createElement('p');
      name.innerHTML = friend.name;

      const selected = document.createElement('div');
      selected.innerHTML = 'Select';
      selected.classList.add('selectBox');

      selected.addEventListener('click', e => {
        if (selected.hasAttribute('selected')) {
          selected.removeAttribute('selected');
        } else {
          selected.setAttribute('selected', true);
        }

        if (selected.hasAttribute('selected')) {
          selectedFriendsList.push(friend);
        } else {
          selectedFriendsList.splice(selectedFriendsList.indexOf(friend), 1);
        }

        document.querySelector('a[href="friends"] .count').innerHTML = selectedFriendsList.length > 0 ? '(' + selectedFriendsList.length + ')' : '';
        document.getElementById('friendCount').innerHTML = selectedFriendsList.length + ' friend' + (selectedFriendsList.length > 1 ? 's' : '');
      });

      div.appendChild(image);
      div.appendChild(name);
      div.appendChild(selected);
      document.getElementById('friendList').appendChild(div);
    }
  });

  // #region login
  ipcRenderer.on('login', (event, arg) => {
    if (arg === 'connected') {
      document.getElementById('formBox').innerHTML = '<h1>You are now logged in!</h1>';

      document.querySelectorAll('#sidebar a').forEach((value, key) => {
        if (key === 0) {
          value.setAttribute('disabled', true);
        } else {
          value.removeAttribute('disabled');
        }
      });
    } else {
      document.getElementById('formBox').innerHTML = '<h1>There was an error, restart the app for now!</h1>';
    }
    document.getElementById('formBox').style.textAlign = 'center';
  });

  // #endregion login

  // #region share

  document.getElementById('confirmButton').addEventListener('click', e => {
    e.preventDefault();

    ipcRenderer.send('shareData', { props: selectedPropsList, friends: selectedFriendsList });
  });

  ipcRenderer.on('shareProgress', (event, arg) => {
    document.getElementById('shareProgress').innerHTML = 'Currently sharing ' + arg.object + ' to ' + arg.target + '(' + arg.nbDone + '/' + arg.nbTotal + ')' + (arg.nbMissed > 0 ? '. Skipped ' + arg.nbMissed + ' objects!' : '');
  });

  ipcRenderer.on('shareMissed', (event, arg) => {
    const missed = document.createElement('div');
    missed.innerHTML = 'Missed sharing ' + arg.object.name + ' to ' + arg.target.name;
    missed.id = arg.object.uuid + '-' + arg.target.uuid;
    document.getElementById('shareMissed').appendChild(missed);

    missed.addEventListener('click', e => {
      e.preventDefault();

      ipcRenderer.send('shareOne', { object: arg.object, target: arg.target });
    });
  });

  ipcRenderer.on('shareSuccess', (event, arg) => {
    const missed = document.getElementById(arg.object.uuid + '-' + arg.target.uuid);

    missed.style.color = 'green';

    setTimeout(() => document.getElementById('shareMissed').removeChild(missed), 5000);
  });

  ipcRenderer.on('shareDone', (event, arg) => {
    document.getElementById('shareProgress').innerHTML = 'Sharing done!' + (arg.nbMissed > 0 ? ' But it missed ' + arg.nbMissed : ' objects.');
    setTimeout(() => { document.getElementById('shareProgress').innerHTML = ''; }, 5000);
  });

  // #endregion share
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('request', {
  sendFormData: (data) => ipcRenderer.send('formData', data)
});
