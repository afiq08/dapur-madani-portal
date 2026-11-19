/* Interaksi prototaip: autentikasi demo, tempahan dapur dan kuota Food Bank. */
(function () {
  'use strict';

  const MONTHLY_QUOTA = 3;
  const DEMO_MATRIC = '2023123456';
  const DEMO_PASSWORD = '123';
  const ADMIN_USERNAME = 'admin';
  const ADMIN_PASSWORD = 'admin123';
  const STUDENT_ACCOUNTS_KEY = 'uitmStudentAccounts';
  const PASSWORD_HASH_ITERATIONS = 120000;
  // Keep the Apps Script integration file, but leave this app disconnected by default.
  const APPS_SCRIPT_URL = '';
  let adminCredentials = null;
  let studentInventory = null;
  const TIME_SLOTS = [
    '08:00 – 09:00 pagi',
    '09:00 – 10:00 pagi',
    '10:00 – 11:00 pagi',
    '11:00 – 12:00 tengah hari',
    '12:00 – 01:00 petang',
    '01:00 – 02:00 petang',
    '02:00 – 03:00 petang',
    '03:00 – 04:00 petang',
    '04:00 – 05:00 petang',
    '05:00 – 06:00 petang',
    '06:00 – 07:00 petang',
    '07:00 – 08:00 malam'
  ];

  function localDateString(date) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return year + '-' + month + '-' + day;
  }

  function currentMonthKey(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }

  function currentStudent() {
    return sessionStorage.getItem('uitmStudentMatric');
  }

  function studentStorageKey(type) {
    return 'uitmPortal:' + currentStudent() + ':' + type;
  }

  function showMessage(element, message, kind) {
    if (!element) {
      console.error(message);
      return;
    }
    element.className = 'alert alert-' + kind;
    element.textContent = message;
    element.classList.remove('d-none');
  }

  function clearMessage(element) {
    if (element) {
      element.classList.add('d-none');
      element.textContent = '';
    }
  }

  function readStoredArray(key, fallback, alertElement) {
    try {
      const saved = localStorage.getItem(key);
      if (saved === null) {
        localStorage.setItem(key, JSON.stringify(fallback));
        return fallback;
      }
      const value = JSON.parse(saved);
      if (!Array.isArray(value)) {
        throw new TypeError('Format data bukan senarai.');
      }
      return value;
    } catch (error) {
      console.error('Gagal membaca data prototaip daripada storan pelayar.', error);
      showMessage(alertElement, 'Data tidak dapat dibaca daripada storan pelayar. Sila benarkan storan tempatan dan muat semula halaman.', 'danger');
      return null;
    }
  }

  function writeStoredArray(key, value, alertElement) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch (error) {
      console.error('Gagal menyimpan data prototaip ke storan pelayar.', error);
      showMessage(alertElement, 'Perubahan tidak dapat disimpan. Semak tetapan storan pelayar anda dan cuba lagi.', 'danger');
      return false;
    }
  }

  function getStudentAccounts() {
    try {
      const saved = localStorage.getItem(STUDENT_ACCOUNTS_KEY);
      if (saved === null) return [];
      const accounts = JSON.parse(saved);
      if (!Array.isArray(accounts) || accounts.some(function (account) {
        return !account || typeof account.name !== 'string' || typeof account.matric !== 'string' ||
          typeof account.salt !== 'string' || typeof account.passwordHash !== 'string';
      })) {
        throw new TypeError('Format akaun pelajar tidak sah.');
      }
      return accounts;
    } catch (error) {
      console.error('Akaun pelajar setempat tidak dapat dibaca.', error);
      throw new Error('Akaun setempat tidak dapat dibaca. Semak storan pelayar anda dan cuba lagi.');
    }
  }

  function saveStudentAccounts(accounts) {
    try {
      localStorage.setItem(STUDENT_ACCOUNTS_KEY, JSON.stringify(accounts));
    } catch (error) {
      console.error('Akaun pelajar setempat tidak dapat disimpan.', error);
      throw new Error('Akaun tidak dapat disimpan. Benarkan storan pelayar dan cuba lagi.');
    }
  }

  function bytesToHex(bytes) {
    return Array.from(bytes, function (byte) {
      return byte.toString(16).padStart(2, '0');
    }).join('');
  }

  function hexToBytes(hex) {
    if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) throw new TypeError('Salt akaun tidak sah.');
    return new Uint8Array(hex.match(/.{2}/g).map(function (byte) { return parseInt(byte, 16); }));
  }

  function createPasswordSalt() {
    if (!window.crypto || !window.crypto.subtle || !window.crypto.getRandomValues) {
      throw new Error('Akaun baharu memerlukan pelayar moden dan halaman melalui HTTPS atau localhost.');
    }
    const salt = new Uint8Array(16);
    window.crypto.getRandomValues(salt);
    return bytesToHex(salt);
  }

  async function hashStudentPassword(password, salt) {
    if (!window.crypto || !window.crypto.subtle) {
      throw new Error('Log masuk akaun baharu memerlukan pelayar moden dan halaman melalui HTTPS atau localhost.');
    }
    const keyMaterial = await window.crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(password),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const hash = await window.crypto.subtle.deriveBits({
      name: 'PBKDF2',
      salt: hexToBytes(salt),
      iterations: PASSWORD_HASH_ITERATIONS,
      hash: 'SHA-256'
    }, keyMaterial, 256);
    return bytesToHex(new Uint8Array(hash));
  }

  function createRequestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') {
      return window.crypto.randomUUID();
    }
    return 'req-' + Date.now() + '-' + Math.random().toString(36).slice(2, 12);
  }

  async function sendToAppsScript(action, data) {
    if (!APPS_SCRIPT_URL) return null;

    let response;
    try {
      // text/plain avoids a JSON CORS preflight for the Apps Script web app.
      response = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        mode: 'cors',
        redirect: 'follow',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify(Object.assign({ action: action }, data))
      });
    } catch (error) {
      console.error('Apps Script network request failed.', error);
      throw new Error('Sambungan ke Google Sheets tidak dapat disahkan. Semak endpoint dan deployment. Jika rekod mungkin sudah dihantar, semak Sheet sebelum mencuba semula.');
    }
    if (!response.ok) throw new Error('Pelayan Apps Script memberi respons HTTP ' + response.status + '.');

    let result;
    try {
      result = await response.json();
    } catch (error) {
      console.error('Apps Script returned a response that was not valid JSON.', error);
      throw new Error('Respons Apps Script tidak dapat dibaca. Semak URL deployment.');
    }
    if (!result || result.ok !== true) {
      throw new Error(result && result.error ? result.error : 'Respons Apps Script tidak sah.');
    }
    return result;
  }

  async function getFromAppsScript(action) {
    if (!APPS_SCRIPT_URL) return null;
    if (action !== 'inventory') throw new Error('Jenis data tidak disokong.');
    return sendToAppsScript('inventoryList', {});
  }

  function setFormBusy(form, busy) {
    const button = form.querySelector('button[type="submit"]');
    if (!button) return;
    button.disabled = busy;
    button.dataset.busy = busy ? 'true' : 'false';
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function formatDate(dateString) {
    const date = new Date(dateString + 'T12:00:00');
    return new Intl.DateTimeFormat('ms-MY', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function seedBookings() {
    const firstDate = new Date();
    firstDate.setDate(firstDate.getDate() + 1);
    const secondDate = new Date();
    secondDate.setDate(secondDate.getDate() + 3);
    return [
      { id: 'BK-001', date: localDateString(firstDate), time: TIME_SLOTS[1], station: 'Stesen A — Dapur Gas', status: 'Disahkan' },
      { id: 'BK-002', date: localDateString(secondDate), time: TIME_SLOTS[3], station: 'Stesen B — Microwave / Air Fryer', status: 'Disahkan' }
    ];
  }

  function seedFoodBankRecords() {
    const date = new Date();
    return [{
      id: 'FB-001',
      item: 'Pek makanan asas',
      date: localDateString(date),
      time: '09:30',
      quantity: 1,
      month: currentMonthKey(date),
      remaining: MONTHLY_QUOTA - 1
    }];
  }

  function getBookings(alertElement) {
    const matric = currentStudent();
    const key = studentStorageKey('bookings');
    const bookings = readStoredArray(key, matric === DEMO_MATRIC ? seedBookings() : [], alertElement);
    if (!bookings || matric === DEMO_MATRIC) return bookings;

    const actualBookings = bookings.filter(function (booking) {
      return booking.id !== 'BK-001' && booking.id !== 'BK-002';
    });
    if (actualBookings.length !== bookings.length) {
      writeStoredArray(key, actualBookings, alertElement);
    }
    return actualBookings;
  }

  function getFoodBankRecords(alertElement) {
    const matric = currentStudent();
    const key = studentStorageKey('foodbank');
    const records = readStoredArray(key, matric === DEMO_MATRIC ? seedFoodBankRecords() : [], alertElement);
    if (!records || matric === DEMO_MATRIC) return records;

    const actualRecords = records.filter(function (record) { return record.id !== 'FB-001'; });
    if (actualRecords.length !== records.length) {
      writeStoredArray(key, actualRecords, alertElement);
    }
    return actualRecords;
  }

  function monthRecords(records, month) {
    return records.filter(function (record) { return record.month === month; });
  }

  function setupAuthentication() {
    const form = document.getElementById('login-form');
    if (!form) return;

    const matricInput = document.getElementById('matric');
    const emailPreview = document.getElementById('student-email-preview');
    const alertElement = document.getElementById('login-alert');
    matricInput.addEventListener('input', function () {
      emailPreview.textContent = (matricInput.value || '0000000000') + '@student.uitm.edu.my';
      matricInput.classList.remove('is-invalid');
      clearMessage(alertElement);
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      const passwordInput = document.getElementById('password');
      const matricValid = /^\d{10}$/.test(matricInput.value.trim());
      matricInput.classList.toggle('is-invalid', !matricValid);
      passwordInput.classList.toggle('is-invalid', !passwordInput.value);
      clearMessage(alertElement);

      if (!matricValid || !passwordInput.value) {
        showMessage(alertElement, 'Sila masukkan nombor matrik 10 digit dan kata laluan anda.', 'danger');
        return;
      }

      const matric = matricInput.value.trim();
      let studentName = '';
      if (matric === DEMO_MATRIC && passwordInput.value === DEMO_PASSWORD) {
        studentName = 'Pelajar Demo';
      } else {
        try {
          const account = getStudentAccounts().find(function (entry) { return entry.matric === matric; });
          if (!account || await hashStudentPassword(passwordInput.value, account.salt) !== account.passwordHash) {
            throw new Error('Nombor matrik atau kata laluan tidak tepat.');
          }
          studentName = account.name;
        } catch (error) {
          showMessage(alertElement, error.message || 'Nombor matrik atau kata laluan tidak tepat.', 'danger');
          passwordInput.classList.add('is-invalid');
          return;
        }
      }

      sessionStorage.setItem('uitmStudentMatric', matric);
      sessionStorage.setItem('uitmStudentName', studentName || 'Pelajar UiTM');
      window.location.href = 'dashboard.html';
    });
  }

  function setupSignup() {
    const form = document.getElementById('signup-form');
    if (!form) return;
    const nameInput = document.getElementById('signup-name');
    const icInput = document.getElementById('signup-ic');
    const matricInput = document.getElementById('signup-matric');
    const passwordInput = document.getElementById('signup-password');
    const confirmInput = document.getElementById('signup-password-confirm');
    const alertElement = document.getElementById('signup-alert');

    matricInput.addEventListener('input', function () {
      document.getElementById('signup-email-preview').textContent =
        (matricInput.value || '0000000000') + '@student.uitm.edu.my';
    });

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      clearMessage(alertElement);
      const matricValid = /^\d{10}$/.test(matricInput.value.trim());
      const icValid = /^\d{6}-\d{2}-\d{4}$/.test(icInput.value.trim());
      const passwordsMatch = passwordInput.value === confirmInput.value;
      nameInput.classList.toggle('is-invalid', nameInput.value.trim().length < 2);
      matricInput.classList.toggle('is-invalid', !matricValid);
      icInput.classList.toggle('is-invalid', !icValid);
      passwordInput.classList.toggle('is-invalid', passwordInput.value.length < 8);
      confirmInput.classList.toggle('is-invalid', !passwordsMatch || confirmInput.value.length < 8);

      if (!nameInput.checkValidity() || nameInput.value.trim().length < 2 || !matricValid || !icValid ||
          passwordInput.value.length < 8 || !passwordsMatch) {
        showMessage(alertElement, 'Semak semula medan yang ditandakan. Kata laluan mestilah sekurang-kurangnya 8 aksara dan sepadan.', 'danger');
        return;
      }

      setFormBusy(form, true);
      try {
        const matric = matricInput.value.trim();
        const accounts = getStudentAccounts();
        if (accounts.some(function (account) { return account.matric === matric; })) {
          matricInput.classList.add('is-invalid');
          throw new Error('Nombor matrik ini sudah didaftarkan. Gunakan akaun tersebut untuk log masuk.');
        }
        const salt = createPasswordSalt();
        const passwordHash = await hashStudentPassword(passwordInput.value, salt);
        saveStudentAccounts(accounts.concat({
          name: nameInput.value.trim(),
          matric: matric,
          email: matric + '@student.uitm.edu.my',
          salt: salt,
          passwordHash: passwordHash
        }));
        form.reset();
        document.getElementById('signup-email-preview').textContent = '0000000000@student.uitm.edu.my';
        showMessage(alertElement, 'Akaun berjaya didaftarkan pada peranti ini. Anda kini boleh log masuk menggunakan nombor matrik dan kata laluan baharu.', 'success');
      } catch (error) {
        showMessage(alertElement, error.message || 'Pendaftaran tidak berjaya. Cuba lagi sebentar lagi.', 'danger');
      } finally {
        setFormBusy(form, false);
      }
    });
  }

  function setupNavigation() {
    const student = currentStudent();
    const pageNeedsLogin = document.body.classList.contains('student-page');
    if (pageNeedsLogin && !student) {
      window.location.replace('index.html');
      return false;
    }

    if (student) {
      let profileName = sessionStorage.getItem('uitmStudentName');
      if (!profileName) {
        try {
          const profile = JSON.parse(localStorage.getItem('uitmStudentProfile:' + student) || 'null');
          profileName = profile && profile.name;
        } catch (error) {
          console.error('Profil pelajar setempat tidak dapat dibaca.', error);
        }
      }
      const suffix = student.slice(-4);
      document.querySelectorAll('[data-student-name]').forEach(function (element) {
        element.textContent = profileName || 'Pelajar ' + suffix;
      });
      document.querySelectorAll('[data-student-initials]').forEach(function (element) {
        element.textContent = 'Ui';
      });
      document.querySelectorAll('[data-student-short]').forEach(function (element) {
        element.textContent = profileName || 'Pelajar ' + suffix;
      });
      document.querySelectorAll('[data-student-matric]').forEach(function (element) {
        element.textContent = student;
      });
    }

    document.querySelectorAll('[data-logout]').forEach(function (link) {
      link.addEventListener('click', function () {
        sessionStorage.removeItem('uitmStudentMatric');
        sessionStorage.removeItem('uitmStudentName');
      });
    });
    return true;
  }

  function renderBookingRows(bookings, target, emptyState, limit) {
    const ordered = bookings.slice().sort(function (first, second) {
      return (first.date + first.time).localeCompare(second.date + second.time);
    });
    const visible = typeof limit === 'number' ? ordered.slice(0, limit) : ordered;
    target.innerHTML = visible.map(function (booking) {
      const statusClass = booking.status === 'Disahkan' ? 'status-confirmed' : 'status-completed';
      return '<tr><td>' + escapeHtml(formatDate(booking.date)) + '</td>' +
        '<td>' + escapeHtml(booking.time) + '</td>' +
        '<td><span class="station-badge">' + escapeHtml(booking.station.split(' — ')[0]) + '</span> ' + escapeHtml(booking.station.split(' — ')[1] || '') + '</td>' +
        '<td><span class="status-badge ' + statusClass + '">' + escapeHtml(booking.status) + '</span></td></tr>';
    }).join('');
    if (emptyState) emptyState.classList.toggle('d-none', visible.length > 0);
    if (visible.length === 0) {
      target.innerHTML = '';
    }
  }

  function setupDashboard() {
    const bookingTable = document.getElementById('dashboard-bookings');
    if (!bookingTable) return;

    const alertElement = document.getElementById('dashboard-alert');
    const bookings = getBookings(alertElement);
    const records = getFoodBankRecords(alertElement);
    if (!bookings || !records) return;

    const month = currentMonthKey(new Date());
    const currentRecords = monthRecords(records, month);
    const remaining = Math.max(0, MONTHLY_QUOTA - currentRecords.reduce(function (total, record) {
      return total + Number(record.quantity || 0);
    }, 0));
    const remainingElement = document.getElementById('quota-remaining');
    remainingElement.textContent = remaining;
    document.getElementById('quota-progress').style.width = ((MONTHLY_QUOTA - remaining) / MONTHLY_QUOTA * 100) + '%';
    document.getElementById('booking-total').textContent = bookings.length;
    renderBookingRows(bookings, bookingTable, null, 3);

    const canvas = document.getElementById('bookingChart');
    if (!canvas) return;
    if (typeof Chart === 'undefined') {
      console.error('Chart.js tidak dapat dimuat; carta tempahan tidak tersedia.');
      return;
    }

    const monday = new Date();
    monday.setHours(0, 0, 0, 0);
    const daysSinceMonday = (monday.getDay() + 6) % 7;
    monday.setDate(monday.getDate() - daysSinceMonday);
    const labels = [];
    const totals = new Array(7).fill(0);
    for (let day = 0; day < 7; day += 1) {
      const date = new Date(monday);
      date.setDate(monday.getDate() + day);
      labels.push(new Intl.DateTimeFormat('ms-MY', { weekday: 'short' }).format(date));
    }
    bookings.forEach(function (booking) {
      const bookingDate = new Date(booking.date + 'T12:00:00');
      const index = (bookingDate.getDay() + 6) % 7;
      const dayStart = new Date(monday);
      dayStart.setDate(monday.getDate() + index);
      if (localDateString(dayStart) === booking.date) totals[index] += 1;
    });

    new Chart(canvas, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [{
          label: 'Tempahan',
          data: totals,
          backgroundColor: '#f7b731',
          hoverBackgroundColor: '#e5a520',
          borderRadius: 6,
          maxBarThickness: 36
        }]
      },
      options: {
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: { displayColors: false, callbacks: { label: function (context) { return context.parsed.y + ' tempahan'; } } }
        },
        scales: {
          x: { grid: { display: false }, border: { display: false } },
          y: { beginAtZero: true, suggestedMax: 2, ticks: { precision: 0, stepSize: 1 }, border: { display: false }, grid: { color: '#eeedf4' } }
        }
      }
    });
  }

  function setupBookings() {
    const form = document.getElementById('booking-form');
    if (!form) return;
    const alertElement = document.getElementById('booking-alert');
    const tableBody = document.getElementById('booking-table-body');
    const emptyState = document.getElementById('booking-empty');
    const bookings = getBookings(alertElement);
    if (!bookings) return;

    const dateInput = document.getElementById('booking-date');
    const slotInput = document.getElementById('booking-slot');
    slotInput.innerHTML = '<option value="">Pilih slot masa</option>' + TIME_SLOTS.map(function (slot) {
      return '<option value="' + escapeHtml(slot) + '">' + escapeHtml(slot) + '</option>';
    }).join('');
    dateInput.min = localDateString(new Date());

    function render() {
      renderBookingRows(bookings, tableBody, emptyState);
      document.getElementById('booking-count').textContent = bookings.length + ' tempahan';
    }
    render();

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      clearMessage(alertElement);
      const selectedStation = form.querySelector('input[name="station"]:checked');
      const dateIsValid = dateInput.value && dateInput.value >= localDateString(new Date());
      dateInput.classList.toggle('is-invalid', !dateIsValid);
      slotInput.classList.toggle('is-invalid', !slotInput.value);
      form.querySelector('.station-error').style.display = selectedStation ? 'none' : 'block';

      if (!dateIsValid || !slotInput.value || !selectedStation) {
        showMessage(alertElement, 'Sila lengkapkan tarikh, slot masa dan pilihan stesen yang sah.', 'danger');
        return;
      }

      const conflict = bookings.some(function (booking) {
        return booking.date === dateInput.value && booking.time === slotInput.value && booking.station === selectedStation.value && booking.status !== 'Dibatalkan';
      });
      if (conflict) {
        showMessage(alertElement, 'Slot dan stesen ini telah ditempah. Sila pilih masa atau stesen yang lain.', 'warning');
        return;
      }

      const record = {
        id: form.dataset.pendingRequestId || createRequestId(),
        date: dateInput.value,
        time: slotInput.value,
        station: selectedStation.value,
        status: 'Disahkan'
      };
      form.dataset.pendingRequestId = record.id;

      setFormBusy(form, true);
      let apiResult;
      try {
        apiResult = await sendToAppsScript('booking', {
          requestId: record.id,
          matric: currentStudent(),
          date: record.date,
          time: record.time,
          station: record.station
        });
      } catch (error) {
        showMessage(alertElement, error.message, 'danger');
        setFormBusy(form, false);
        return;
      }

      const updated = bookings.concat(record);
      const localSaved = writeStoredArray(studentStorageKey('bookings'), updated, alertElement);
      if (!localSaved && !apiResult) {
        setFormBusy(form, false);
        return;
      }
      bookings.push(record);
      delete form.dataset.pendingRequestId;
      form.reset();
      dateInput.classList.remove('is-invalid');
      slotInput.classList.remove('is-invalid');
      form.querySelector('.station-error').style.display = 'none';
      render();
      setFormBusy(form, false);
      if (apiResult && apiResult.emailSent === false) {
        showMessage(alertElement, 'Tempahan disimpan dalam Google Sheet, tetapi notifikasi emel tidak berjaya dihantar. Sila maklumkan kepada pentadbir.', 'warning');
      } else if (apiResult) {
        showMessage(alertElement, 'Tempahan disimpan dalam Google Sheet. Notifikasi emel dihantar kepada anda dan pentadbir.', 'success');
      } else {
        showMessage(alertElement, 'Tempahan demo berjaya direkodkan pada peranti ini.', 'success');
      }
    });
  }

  function demoInventory() {
    return [
      { id: 'FOOD-001', name: 'Beras 5 kg', category: 'Bijirin', quantity: 18, expiry: '2027-06-18' },
      { id: 'FOOD-002', name: 'Minyak masak 1 kg', category: 'Keperluan asas', quantity: 12, expiry: '2027-04-20' },
      { id: 'FOOD-003', name: 'Makanan dalam tin', category: 'Makanan dalam tin', quantity: 25, expiry: '2027-08-22' },
      { id: 'FOOD-004', name: 'Mi segera (pek)', category: 'Bijirin', quantity: 30, expiry: '2027-01-30' }
    ];
  }

  function renderStudentInventory(items) {
    const target = document.getElementById('student-food-inventory');
    const select = document.getElementById('food-item');
    if (!target || !select) return;
    const available = items.filter(function (item) { return Number(item.quantity) > 0; });
    target.innerHTML = available.length ? available.map(function (item) {
      return '<article class="student-food-item"><span class="food-item-icon"><i class="bi bi-basket2"></i></span>' +
        '<div><strong>' + escapeHtml(item.name) + '</strong><small>' + escapeHtml(item.category) + '</small></div>' +
        '<span class="food-stock-pill">' + escapeHtml(item.quantity) + ' unit</span></article>';
    }).join('') : '<div class="empty-state"><i class="bi bi-basket"></i><strong>Tiada stok tersedia</strong><span>Semak semula kemudian.</span></div>';

    const selected = select.value;
    select.innerHTML = '<option value="">Pilih item makanan</option>' + available.map(function (item) {
      return '<option value="' + escapeHtml(item.name) + '">' + escapeHtml(item.name) + ' · ' + escapeHtml(item.quantity) + ' tersedia</option>';
    }).join('');
    if (available.some(function (item) { return item.name === selected; })) select.value = selected;
    select.disabled = available.length === 0;
  }

  async function loadStudentInventory() {
    const alertElement = document.getElementById('student-inventory-alert');
    try {
      const result = await getFromAppsScript('inventory');
      if (!result) {
        const cached = localStorage.getItem('uitmFoodBankInventoryCache');
        studentInventory = cached === null ? demoInventory() : JSON.parse(cached);
        if (!Array.isArray(studentInventory)) throw new Error('Cache inventori tidak sah.');
        if (cached === null) localStorage.setItem('uitmFoodBankInventoryCache', JSON.stringify(studentInventory));
      } else {
        studentInventory = result.items;
        if (!Array.isArray(studentInventory)) throw new Error('Format inventori tidak sah.');
        try {
          localStorage.setItem('uitmFoodBankInventoryCache', JSON.stringify(studentInventory));
        } catch (error) {
          console.error('Cache inventori tidak dapat disimpan.', error);
        }
      }
      renderStudentInventory(studentInventory);
    } catch (error) {
      console.error('Inventori pelajar gagal dimuatkan.', error);
      let cached = null;
      try {
        cached = JSON.parse(localStorage.getItem('uitmFoodBankInventoryCache') || 'null');
      } catch (storageError) {
        console.error('Cache inventori setempat tidak dapat dibaca.', storageError);
      }
      if (Array.isArray(cached)) {
        studentInventory = cached;
        renderStudentInventory(studentInventory);
      }
      showMessage(alertElement, error.message, 'danger');
    }
  }

  function renderAdminInventory(items) {
    const body = document.getElementById('admin-inventory-body');
    const empty = document.getElementById('admin-inventory-empty');
    const sorted = items.slice().sort(function (first, second) {
      return first.name.localeCompare(second.name, 'ms');
    });
    body.innerHTML = sorted.map(function (item) {
      return '<tr data-item-id="' + escapeHtml(item.id) + '">' +
        '<td><strong>' + escapeHtml(item.name) + '</strong><small class="admin-item-id">' + escapeHtml(item.id) + '</small></td>' +
        '<td>' + escapeHtml(item.category) + '</td><td>' + escapeHtml(item.quantity) + '</td>' +
        '<td>' + escapeHtml(formatDate(item.expiry)) + '</td>' +
        '<td><div class="admin-row-actions"><button class="btn btn-sm btn-light-outline edit-food-item" type="button" aria-label="Edit ' + escapeHtml(item.name) + '"><i class="bi bi-pencil"></i></button>' +
        '<button class="btn btn-sm btn-outline-danger delete-food-item" type="button" aria-label="Padam ' + escapeHtml(item.name) + '"><i class="bi bi-trash"></i></button></div></td></tr>';
    }).join('');
    empty.classList.toggle('d-none', sorted.length > 0);
    document.getElementById('admin-item-count').textContent = sorted.length;
    document.getElementById('admin-stock-total').textContent = sorted.reduce(function (sum, item) {
      return sum + Number(item.quantity || 0);
    }, 0);
    const studentCache = JSON.stringify(sorted);
    try {
      localStorage.setItem('uitmFoodBankInventoryCache', studentCache);
    } catch (error) {
      console.error('Cache inventori pelajar tidak dapat dikemas kini.', error);
    }
  }

  function getBookingStart(booking) {
    const time = /^(\d{2}):(\d{2})/.exec(booking.time || '');
    if (!time || !/^\d{4}-\d{2}-\d{2}$/.test(booking.date || '')) return null;
    const start = new Date(booking.date + 'T' + time[1] + ':' + time[2] + ':00');
    return Number.isNaN(start.getTime()) ? null : start;
  }

  function formatRemainingTime(milliseconds) {
    const minutes = Math.max(0, Math.ceil(milliseconds / 60000));
    const hours = Math.floor(minutes / 60);
    const remainder = minutes % 60;
    return hours > 0 ? hours + ' jam ' + remainder + ' minit' : remainder + ' minit';
  }

  function getAdminBookingStatus(booking, now) {
    const start = getBookingStart(booking);
    if (!start) return 'Masa tidak sah';
    const end = new Date(start.getTime() + 60 * 60 * 1000);
    if (now < start) return 'Akan datang · ' + formatRemainingTime(start - now);
    if (now < end) return 'Tempoh berjalan · tamat dalam ' + formatRemainingTime(end - now);
    return 'Tempoh tamat';
  }

  function renderAdminBookings(alertElement) {
    const target = document.getElementById('admin-bookings-body');
    const emptyState = document.getElementById('admin-bookings-empty');
    if (!target || !emptyState) return;

    let students;
    try {
      students = getStudentAccounts().map(function (account) {
        return { matric: account.matric, name: account.name };
      });
    } catch (error) {
      showMessage(alertElement, error.message, 'danger');
      return;
    }
    if (!students.some(function (student) { return student.matric === DEMO_MATRIC; })) {
      students.push({ matric: DEMO_MATRIC, name: 'Pelajar Demo' });
    }

    const bookings = [];
    students.forEach(function (student) {
      const key = 'uitmPortal:' + student.matric + ':bookings';
      const saved = localStorage.getItem(key);
      if (saved === null) return;
      try {
        const studentBookings = JSON.parse(saved);
        if (!Array.isArray(studentBookings)) throw new TypeError('Rekod bukan senarai.');
        studentBookings.forEach(function (booking) {
          if (!booking || typeof booking.date !== 'string' || typeof booking.time !== 'string' ||
              typeof booking.station !== 'string') {
            throw new TypeError('Butiran tempahan tidak lengkap.');
          }
          bookings.push(Object.assign({ matric: student.matric, studentName: student.name }, booking));
        });
      } catch (error) {
        console.error('Rekod tempahan tidak dapat dibaca untuk ' + student.matric + '.', error);
        showMessage(alertElement, 'Sebahagian rekod tempahan tidak dapat dibaca (' + student.matric + ').', 'danger');
      }
    });

    bookings.sort(function (first, second) {
      return (first.date + first.time).localeCompare(second.date + second.time);
    });
    const now = new Date();
    target.innerHTML = bookings.map(function (booking) {
      return '<tr><td><strong>' + escapeHtml(booking.studentName) + '</strong><small class="admin-item-id">' + escapeHtml(booking.matric) + '</small></td>' +
        '<td>' + escapeHtml(formatDate(booking.date)) + '</td>' +
        '<td>' + escapeHtml(booking.time) + '</td>' +
        '<td>' + escapeHtml(booking.station) + '</td>' +
        '<td><span class="status-badge ' + (getBookingStart(booking) && now >= getBookingStart(booking) && now < new Date(getBookingStart(booking).getTime() + 3600000) ? 'status-confirmed' : 'status-completed') + '">' +
        escapeHtml(getAdminBookingStatus(booking, now)) + '</span></td></tr>';
    }).join('');
    emptyState.classList.toggle('d-none', bookings.length > 0);
    document.getElementById('admin-booking-count').textContent = bookings.length + ' tempahan';
  }

  function setupAdmin() {
    const loginForm = document.getElementById('admin-login-form');
    if (!loginForm) return;
    const loginModalElement = document.getElementById('adminLoginModal');
    const loginModal = bootstrap.Modal.getOrCreateInstance(loginModalElement);
    const loginAlert = document.getElementById('admin-login-alert');
    const adminAlert = document.getElementById('admin-alert');
    const itemModal = bootstrap.Modal.getOrCreateInstance(document.getElementById('foodItemModal'));
    let items = [];
    let bookingRefreshTimer = null;
    loginModal.show();

    async function refreshInventory() {
      try {
        const result = await getFromAppsScript('inventory');
        if (result) {
          items = result.items;
          if (!Array.isArray(items)) throw new Error('Format inventori tidak sah.');
          document.getElementById('admin-data-source').textContent = 'Google Sheets';
        } else {
          items = JSON.parse(localStorage.getItem('uitmFoodBankInventoryCache') || 'null') || demoInventory();
          document.getElementById('admin-data-source').textContent = 'Storan demo';
        }
        renderAdminInventory(items);
        renderAdminBookings(adminAlert);
      } catch (error) {
        showMessage(adminAlert, error.message, 'danger');
        throw error;
      }
    }

    loginForm.addEventListener('submit', async function (event) {
      event.preventDefault();
      const username = document.getElementById('admin-username').value.trim();
      const password = document.getElementById('admin-password').value;
      if (username !== ADMIN_USERNAME || password !== ADMIN_PASSWORD) {
        showMessage(loginAlert, 'Username atau password admin tidak tepat.', 'danger');
        return;
      }
      setFormBusy(loginForm, true);
      try {
        const result = await sendToAppsScript('adminLogin', {
          adminUsername: username,
          adminPassword: password
        });
        if (APPS_SCRIPT_URL && !result) throw new Error('Pengesahan Apps Script tidak tersedia.');
        adminCredentials = { adminUsername: username, adminPassword: password };
        document.getElementById('admin-session-label').textContent = 'Admin disahkan';
        loginModal.hide();
        await refreshInventory();
        if (bookingRefreshTimer) window.clearInterval(bookingRefreshTimer);
        bookingRefreshTimer = window.setInterval(function () { renderAdminBookings(adminAlert); }, 60000);
      } catch (error) {
        showMessage(loginAlert, error.message || 'Pengesahan admin gagal. Semak Script Properties dan deployment.', 'danger');
        adminCredentials = null;
      } finally {
        setFormBusy(loginForm, false);
      }
    });

    document.getElementById('add-food-item').addEventListener('click', function () {
      document.getElementById('food-item-form').reset();
      document.getElementById('food-item-id').value = '';
      document.getElementById('foodItemModalTitle').textContent = 'Tambah item makanan';
      clearMessage(document.getElementById('food-item-alert'));
      itemModal.show();
    });

    document.getElementById('admin-inventory-body').addEventListener('click', async function (event) {
      const row = event.target.closest('tr[data-item-id]');
      if (!row) return;
      const item = items.find(function (entry) { return entry.id === row.dataset.itemId; });
      if (!item) return;

      if (event.target.closest('.edit-food-item')) {
        document.getElementById('food-item-id').value = item.id;
        document.getElementById('food-item-name').value = item.name;
        document.getElementById('food-item-category').value = item.category;
        document.getElementById('food-item-quantity').value = item.quantity;
        document.getElementById('food-item-expiry').value = item.expiry;
        document.getElementById('foodItemModalTitle').textContent = 'Kemaskini item makanan';
        clearMessage(document.getElementById('food-item-alert'));
        itemModal.show();
      } else if (event.target.closest('.delete-food-item')) {
        if (!window.confirm('Padam "' + item.name + '" daripada inventori?')) return;
        try {
          const result = await sendToAppsScript('inventoryDelete', Object.assign({
            itemId: item.id
          }, adminCredentials || {}));
          if (APPS_SCRIPT_URL && !result) throw new Error('Sambungan admin tidak tersedia.');
          items = items.filter(function (entry) { return entry.id !== item.id; });
          if (!result) localStorage.setItem('uitmFoodBankInventoryCache', JSON.stringify(items));
          renderAdminInventory(items);
          showMessage(adminAlert, 'Item inventori berjaya dipadam.', 'success');
        } catch (error) {
          showMessage(adminAlert, error.message, 'danger');
        }
      }
    });

    document.getElementById('food-item-form').addEventListener('submit', async function (event) {
      event.preventDefault();
      const form = event.currentTarget;
      const formAlert = document.getElementById('food-item-alert');
      clearMessage(formAlert);
      if (!form.reportValidity()) return;
      const record = {
        itemId: document.getElementById('food-item-id').value || createRequestId(),
        name: document.getElementById('food-item-name').value.trim(),
        category: document.getElementById('food-item-category').value,
        quantity: Number(document.getElementById('food-item-quantity').value),
        expiry: document.getElementById('food-item-expiry').value
      };
      setFormBusy(form, true);
      try {
        const result = await sendToAppsScript('inventorySave', Object.assign({}, record, adminCredentials || {}));
        if (APPS_SCRIPT_URL && !result) throw new Error('Sambungan admin tidak tersedia.');
        const saved = Object.assign({ id: record.itemId }, record, result && result.item ? result.item : {});
        const index = items.findIndex(function (item) { return item.id === saved.id; });
        if (index >= 0) items.splice(index, 1, saved);
        else items.push(saved);
        if (!result) localStorage.setItem('uitmFoodBankInventoryCache', JSON.stringify(items));
        renderAdminInventory(items);
        itemModal.hide();
        form.reset();
        showMessage(adminAlert, 'Inventori berjaya disimpan dan paparan pelajar akan dikemas kini.', 'success');
      } catch (error) {
        showMessage(formAlert, error.message, 'danger');
      } finally {
        setFormBusy(form, false);
      }
    });

    document.getElementById('admin-logout').addEventListener('click', function () {
      adminCredentials = null;
      if (bookingRefreshTimer) {
        window.clearInterval(bookingRefreshTimer);
        bookingRefreshTimer = null;
      }
      document.getElementById('admin-session-label').textContent = 'Sesi belum disahkan';
      loginForm.reset();
      clearMessage(loginAlert);
      loginModal.show();
    });
  }

  function setupFoodBank() {
    const form = document.getElementById('foodbank-form');
    if (!form) return;

    const alertElement = document.getElementById('foodbank-alert');
    const tableBody = document.getElementById('foodbank-table-body');
    const emptyState = document.getElementById('foodbank-empty');
    const records = getFoodBankRecords(alertElement);
    if (!records) return;
    const month = currentMonthKey(new Date());
    const monthName = new Intl.DateTimeFormat('ms-MY', { month: 'long', year: 'numeric' }).format(new Date());
    document.getElementById('quota-month-label').textContent = monthName.toLocaleUpperCase('ms-MY');
    document.getElementById('quota-month-short').textContent = monthName;
    const itemSelect = document.getElementById('food-item');
    loadStudentInventory();

    let serverQuotaRemaining = null;

    function getRemaining() {
      if (serverQuotaRemaining !== null) return serverQuotaRemaining;
      const used = monthRecords(records, month).reduce(function (total, record) {
        return total + Number(record.quantity || 0);
      }, 0);
      return Math.max(0, MONTHLY_QUOTA - used);
    }

    function render() {
      const remaining = getRemaining();
      const used = MONTHLY_QUOTA - remaining;
      document.getElementById('quota-remaining').textContent = remaining;
      document.getElementById('quota-used-label').textContent = used + ' unit digunakan · ' + remaining + ' unit berbaki';
      document.getElementById('quota-track-fill').style.width = (used / MONTHLY_QUOTA * 100) + '%';
      document.querySelector('.quota-track').setAttribute('aria-valuenow', String(used));

      const current = monthRecords(records, month).slice().sort(function (first, second) {
        return (second.date + second.time).localeCompare(first.date + first.time);
      });
      tableBody.innerHTML = current.map(function (record) {
        return '<tr><td>' + escapeHtml(record.item) + '</td>' +
          '<td>' + escapeHtml(formatDate(record.date)) + '</td>' +
          '<td><span class="quantity-pill">' + escapeHtml(record.quantity) + ' unit</span></td>' +
          '<td><span class="remaining-pill">' + escapeHtml(record.remaining) + ' / ' + MONTHLY_QUOTA + '</span></td></tr>';
      }).join('');
      emptyState.classList.toggle('d-none', current.length > 0);
      document.getElementById('foodbank-record-count').textContent = current.length + ' rekod';
      if (current.length === 0) tableBody.innerHTML = '';
    }
    render();

    form.addEventListener('submit', async function (event) {
      event.preventDefault();
      clearMessage(alertElement);
      if (!itemSelect.value) {
        itemSelect.classList.add('is-invalid');
        showMessage(alertElement, 'Sila pilih item makanan sebelum mengesahkan pengambilan.', 'danger');
        return;
      }
      itemSelect.classList.remove('is-invalid');
      if (studentInventory && !studentInventory.some(function (item) {
        return item.name === itemSelect.value && Number(item.quantity) > 0;
      })) {
        showMessage(alertElement, 'Item ini tiada dalam stok. Sila muat semula pilihan inventori.', 'danger');
        loadStudentInventory();
        return;
      }
      if (getRemaining() <= 0) {
        showMessage(alertElement, 'Kuota Bulanan Anda Telah Habis!', 'danger');
        return;
      }

      const remainingAfter = getRemaining() - 1;
      const now = new Date();
      const record = {
        id: form.dataset.pendingRequestId || createRequestId(),
        item: itemSelect.value,
        date: localDateString(now),
        time: new Intl.DateTimeFormat('ms-MY', { hour: '2-digit', minute: '2-digit', hour12: false }).format(now),
        quantity: 1,
        month: month,
        remaining: remainingAfter
      };
      form.dataset.pendingRequestId = record.id;

      setFormBusy(form, true);
      let apiResult;
      try {
        apiResult = await sendToAppsScript('foodbank', {
          requestId: record.id,
          matric: currentStudent(),
          item: record.item,
          quantity: record.quantity
        });
      } catch (error) {
        showMessage(alertElement, error.message, 'danger');
        setFormBusy(form, false);
        return;
      }
      if (apiResult && Number.isInteger(apiResult.remaining)) {
        record.remaining = apiResult.remaining;
        serverQuotaRemaining = apiResult.remaining;
      }

      const localSaved = writeStoredArray(studentStorageKey('foodbank'), records.concat(record), alertElement);
      if (!localSaved && !apiResult) {
        setFormBusy(form, false);
        return;
      }
      records.push(record);
      if (studentInventory) {
        const claimedItem = studentInventory.find(function (item) { return item.name === record.item; });
        if (claimedItem) claimedItem.quantity = Math.max(0, Number(claimedItem.quantity) - 1);
        renderStudentInventory(studentInventory);
      }
      delete form.dataset.pendingRequestId;
      form.reset();
      render();
      setFormBusy(form, false);
      const remainingNow = apiResult && Number.isInteger(apiResult.remaining) ? apiResult.remaining : remainingAfter;
      if (apiResult) {
        serverQuotaRemaining = remainingNow;
        render();
        showMessage(alertElement, 'Pengambilan diluluskan dan direkodkan dalam Google Sheet. Baki kuota: ' + remainingNow + ' / ' + MONTHLY_QUOTA + '.', 'success');
      } else {
        showMessage(alertElement, 'Pengambilan demo diluluskan. Baki kuota: ' + remainingNow + ' / ' + MONTHLY_QUOTA + '.', 'success');
      }
    });
  }

  document.addEventListener('DOMContentLoaded', function () {
    setupAuthentication();
    setupSignup();
    if (!setupNavigation()) return;
    setupDashboard();
    setupBookings();
    setupFoodBank();
    setupAdmin();
  });
}());
