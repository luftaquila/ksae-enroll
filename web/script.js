let notyf = new Notyf({
  ripple: false,
  duration: 3500,
  types: [{
    type: 'warn',
    background: 'orange',
    icon: {
      className: 'fa fa-exclamation-triangle',
      tagName: 'i',
      color: 'white',
    }
  }]
});

let queues = {};
let last = undefined;

window.addEventListener("DOMContentLoaded", async () => {
  if (localStorage.getItem('phone')) {
    document.getElementById('phone').value = localStorage.getItem('phone');
    document.getElementById('phone').dispatchEvent(new Event('input'));
  }

  await refresh();
  setInterval(refresh, 10000);
});

document.getElementById('phone').addEventListener('input', e => {
  e.target.value = e.target.value
    .replace(/[^0-9]/g, '')
    .replace(/^(\d{0,3})(\d{0,4})(\d{0,4})$/g, "$1-$2-$3").replace(/(\-{1,2})$/g, "");
});

document.getElementById('check').addEventListener('click', query);

async function refresh() {
  try {
    const queue = await get('/queue');
    let html = '';

    for (let [k, v] of Object.entries(queue)) {
      queues[k] = v.name;
      html += `<tr><td>${v.name}</td><td>${v.length} 명</td></tr>`;
    }

    document.getElementById('total').innerHTML = html;

    if (localStorage.getItem('phone')) {
      await query();
    }

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`대기열 업데이트에 실패했습니다.<br>${e.message}`);
  }
}

async function query() {
  const phone = document.getElementById('phone').value.replace(/-/g, '');

  if (!phone) {
    return err('전화번호를 입력하세요.');
  }

  if (!/^010\d{8}$/.test(phone)) {
    return err('유효하지 않은 전화번호입니다.');
  }

  try {
    let result = await get(`/queue/${phone}`);

    if (result.rank === -1) {
      return err('대기중인 검차가 없습니다');
    }

    document.getElementById('queue').innerText = queues[result.type];
    document.getElementById('rank').innerText = result.rank;

    localStorage.setItem('phone', phone);
  } catch (e) {
    return err(e.message);
  }

  function err(msg) {
    notyf.error(msg);
    document.getElementById('queue').innerText = '-';
    document.getElementById('rank').innerText = '-';

    localStorage.removeItem('phone');
  }
}

/*******************************************************************************
 * utility functions                                                           *
 ******************************************************************************/
async function get(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(await res.text());
  }

  const type = res.headers.get('content-type');

  if (type && type.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}
