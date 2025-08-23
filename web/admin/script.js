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

let entries = undefined;
let queues = undefined;
let last = undefined;

// init UI and event handlers
window.addEventListener("DOMContentLoaded", async () => {
  try {
    entries = await get('/entry/all');
  } catch (e) {
    return notyf.error(`엔트리 정보를 가져올 수 없습니다.<br>${e.message}`);
  }

  // draw tabs, contents and advanced menu
  await (async () => {
    try {
      queues = await get('/enroll/queue');

      let tabs = '';
      let contents = '';

      for (const [k, v] of Object.entries(queues)) {
        tabs += `<div class="tab" id="${k}">${v.name}</div>`;
        contents += `<table class="tab-content" id="${k}-table"></div>`;
      }

      document.getElementById('tabs').innerHTML = tabs;
      document.getElementById('tab-container').innerHTML = contents;

      const sms = await get('/enroll/settings/sms');
      document.getElementById('sms').value = sms.value;
      document.querySelector('.tab:first-child').click();
    } catch (e) {
      return notyf.error(`대기열 정보를 가져오지 못했습니다.<br>${e.message}`);
    }
  })();

  await refresh();
  setInterval(refresh, 5000);
});

document.addEventListener('click', async e => {
  if (e.target.matches('.tab')) {
    document.querySelectorAll('.tab').forEach(tab => tab.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(tab => tab.classList.add('hidden'));

    e.target.classList.add('active');
    document.getElementById(`${e.target.id}-table`).classList.remove('hidden');
    document.getElementById('enroll-container').classList.toggle('hidden', e.target.id !== 'formula');

    localStorage.setItem('current-enroll', e.target.id);
    refresh_queue(e.target.id);
  }

  else if (e.target.closest('.delete')) {
    try {
      let current = localStorage.getItem('current-enroll');

      await post('DELETE', `/enroll/admin/${current}`, {
        phone: e.target.closest('.delete').dataset.target
      });

      refresh_queue(current);
    } catch (e) {
      return notyf.error(`엔트리를 삭제하지 못했습니다.<br>${e.message}`);
    }
  }
});

document.addEventListener('change', async e => {
  if (e.target.matches('#sms')) {
    try {
      await post('PATCH', '/enroll/admin/settings/sms', {
        value: document.getElementById('sms').value
      });

      let sms = await get('/enroll/settings/sms');
      document.getElementById('sms').value = sms.value;

      notyf.success('SMS 설정을 변경했습니다.');
    } catch (e) {
      return notyf.error(`SMS 설정을 변경하지 못했습니다.<br>${e.message}`);
    }
  }
});

document.getElementById('entry').addEventListener('input', e => {
  const entry = entries[e.target.value];
  document.getElementById('team').innerText = entry ? `${entry.univ} ${entry.team}` : '';
});

document.getElementById('confirm').addEventListener('click', async () => {
  const num = document.getElementById('entry').value;

  if (!num) {
    return notyf.error('엔트리 번호를 입력하세요.');
  }

  try {
    await post('POST', '/entry/enroll', { num: num });
    document.getElementById('entry').value = '';
    document.getElementById('team').innerText = '';
    notyf.success('엔트리 등록을 완료했습니다.');
  } catch (e) {
    return notyf.error(e.message);
  }
});

/*******************************************************************************
 * functions                                                                   *
 ******************************************************************************/
async function refresh() {
  try {
    let current = localStorage.getItem('current-enroll');
    let target = document.getElementById(current);

    if (current && target) {
      target.click();
    }

    let sms = await get('/enroll/settings/sms');
    document.getElementById('sms').value = sms.value;

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`설정 정보를 가져오지 못했습니다.<br>${e.message}`);
  }
}

async function refresh_queue(q) {
  try {
    let queue = await get(`/enroll/admin/${q}`);
    let html = '<tr>';

    for (let item of queue) {
      html += `<td><span class='btn red delete' data-target='${item.phone}'><i class='fa fa-trash'></i></span></td>`;
      html += `<td>${phone(item.phone)}</td></tr>`;
    }

    document.getElementById(`${q}-table`).innerHTML = html;
    document.getElementById('status').innerText = queue.length;

    if (!last) {
      last = new Date();
      setInterval(() => document.getElementById('update').innerText = ((new Date() - last) / 1000).toFixed(0));
    } else {
      last = new Date();
    }
  } catch (e) {
    return notyf.error(`대기열을 가져오지 못했습니다.<br>${e.message}`);
  }
}

/*******************************************************************************
 * utility functions                                                           *
 ******************************************************************************/
async function get(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(`failed to get ${url}: ${res.status}`);
  }

  const type = res.headers.get('content-type');

  if (type && type.includes('application/json')) {
    return await res.json();
  } else {
    return await res.text();
  }
}

async function post(method, url, data) {
  const res = await fetch(url, {
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(await res.text());
  }
}

function phone(number) {
  return number.replace(/(\d{3})(\d{4})(\d{4})/, '$1-$2-$3');
}
