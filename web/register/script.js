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

window.addEventListener("DOMContentLoaded", async () => {
  try {
    const queue = await get('/queue');
    let html = '<option value="" selected disabled>대회 선택</option>';

    for (const [k, v] of Object.entries(queue)) {
      html += `<option value="${k}">${v.name}</option>`;
    }

    document.getElementById('event').innerHTML = html;
  } catch (e) {
    return notyf.error(`대회 정보를 가져올 수 없습니다.<br>${e.message}`);
  }
});

document.getElementById('phone').addEventListener('input', e => {
  e.target.value = e.target.value
    .replace(/[^0-9]/g, '')
    .replace(/^(\d{0,3})(\d{0,4})(\d{0,4})$/g, "$1-$2-$3").replace(/(\-{1,2})$/g, "");
});

document.getElementById('submit').addEventListener('click', async () => {
  let data = {
    type: document.getElementById('event').value,
    phone: document.getElementById('phone').value.replace(/-/g, ''),
  };

  if (!data.type) {
    return notyf.error('대회를 선택하세요.');
  }

  if (!data.phone) {
    return notyf.error('전화번호를 입력하세요.');
  }

  if (!/^010\d{8}$/.test(data.phone)) {
    return notyf.error('유효하지 않은 전화번호입니다.');
  }

  if (document.getElementById('agree').checked === false) {
    return notyf.error('개인정보 수집 및 이용에 동의해주세요.');
  }

  try {
    await post(`/register/${data.type}`, data);

    document.getElementById('event').value = '';
    document.getElementById('phone').value = '';
    document.getElementById('agree').checked = false;

    notyf.success('등록되었습니다.');
  } catch (e) {
    return notyf.error(e.message);
  }
});

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

async function post(url, data) {
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });

  if (!res.ok) {
    throw new Error(`${await res.text()}`);
  }
}
