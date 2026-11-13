/**
 * Google Apps Script web app for the UiTM Dapur Madani prototype.
 * Configure SPREADSHEET_ID and ADMIN_EMAIL in Script Properties before deployment.
 */
const CONFIG = Object.freeze({
  spreadsheetId: '',
  adminEmail: '',
  bookingsSheet: 'Tempahan Dapur',
  foodBankSheet: 'Pengambilan Food Bank',
  registrationSheet: 'Pendaftaran Pelajar',
  inventorySheet: 'Inventori Food Bank',
  monthlyQuota: 3,
  studentDomain: '@student.uitm.edu.my',
  studentRequestsPerHour: 12,
  bookingEmailsPerHour: 10,
  globalRequestsPerHour: 60,
  cacheWindowSeconds: 3600,
  allowedSlots: [
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
  ],
  allowedStations: [
    'Stesen A — Dapur Gas',
    'Stesen B — Microwave / Air Fryer'
  ]
});

const BOOKING_HEADERS = [
  'Request ID', 'Tarikh Hantar', 'No. Matrik', 'E-mel Pelajar',
  'Tarikh Tempahan', 'Slot Masa', 'Stesen', 'Status', 'Status Emel'
];
const FOOD_BANK_HEADERS = [
  'Request ID', 'Tarikh Hantar', 'No. Matrik', 'E-mel Pelajar',
  'Item Makanan', 'Kuantiti', 'Bulan', 'Baki Kuota'
];
const REGISTRATION_HEADERS = [
  'Nama Penuh', 'No. IC', 'No. Matrik', 'E-mel Pelajar',
  'Salt', 'Password Hash', 'Tarikh Daftar', 'Status Notifikasi'
];
const INVENTORY_HEADERS = [
  'Item ID', 'Nama Makanan', 'Kategori', 'Kuantiti Stok',
  'Tarikh Luput', 'Tarikh Kemaskini'
];

function doGet(event) {
  const action = event && event.parameter ? event.parameter.action : '';
  if (action !== 'inventory') {
    return jsonResponse_({ ok: false, error: 'Jenis permintaan tidak disokong.' });
  }
  return jsonResponse_(listInventory_());
}

function listInventory_() {
  try {
    const sheet = getOrCreateInventorySheet_(getSpreadsheet_());
    const lastRow = sheet.getLastRow();
    const items = lastRow < 2 ? [] : sheet.getRange(2, 1, lastRow - 1, INVENTORY_HEADERS.length)
      .getValues()
      .filter(function (row) { return String(row[0]).trim() !== ''; })
      .map(function (row) {
        return {
          id: String(row[0]),
          name: String(row[1]),
          category: String(row[2]),
          quantity: Number(row[3]) || 0,
          expiry: formatSheetDate_(row[4])
        };
      });
    return { ok: true, items: items };
  } catch (error) {
    console.error('Could not load Food Bank inventory.', error);
    return { ok: false, error: 'Inventori tidak dapat dimuatkan.' };
  }
}

/**
 * Accepts JSON text/plain POST requests from the static GitHub Pages front end.
 * Supported actions: student registration/login, inventory, booking and foodbank.
 */
function doPost(event) {
  let payload;
  try {
    if (!event || !event.postData || !event.postData.contents) {
      return jsonResponse_({ ok: false, error: 'Permintaan kosong.' });
    }
    payload = JSON.parse(event.postData.contents);
  } catch (error) {
    return jsonResponse_({ ok: false, error: 'Format JSON tidak sah.' });
  }

  if (payload && payload.action === 'register') return registerStudent_(payload);
  if (payload && payload.action === 'studentLogin') return loginStudent_(payload);
  if (payload && payload.action === 'adminLogin') return loginAdmin_(payload);
  if (payload && payload.action === 'inventoryList') return jsonResponse_(listInventory_());
  if (payload && payload.action === 'inventorySave') return saveInventoryItem_(payload);
  if (payload && payload.action === 'inventoryDelete') return deleteInventoryItem_(payload);

  const validation = validateRequest_(payload);
  if (validation) return jsonResponse_({ ok: false, error: validation });

  const properties = PropertiesService.getScriptProperties();
  const adminEmail = String(properties.getProperty('ADMIN_EMAIL') || CONFIG.adminEmail).trim();
  if (payload.action === 'booking' && !isEmail_(adminEmail)) {
    return jsonResponse_({ ok: false, error: 'Alamat emel pentadbir tidak sah. Semak ADMIN_EMAIL dalam Script Properties.' });
  }

  let lock;
  let spreadsheet;
  let savedRow;
  let sheet;
  let studentEmail;
  let monthKey;
  let remainingQuota;
  let duplicateResult;

  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) {
      return jsonResponse_({ ok: false, error: 'Pelayan sedang sibuk. Sila cuba semula sebentar lagi.' });
    }

    checkRateLimit_('global', CONFIG.globalRequestsPerHour);
    checkRateLimit_('student:' + payload.matric, CONFIG.studentRequestsPerHour);
    spreadsheet = getSpreadsheet_();
    studentEmail = payload.matric + CONFIG.studentDomain;

    if (payload.action === 'booking') {
      sheet = getOrCreateSheet_(spreadsheet, CONFIG.bookingsSheet, BOOKING_HEADERS);
      duplicateResult = findDuplicate_(sheet, payload.requestId, 9);
      if (duplicateResult) return jsonResponse_(duplicateResult);
      checkRateLimit_('booking-email-global', CONFIG.bookingEmailsPerHour);
      savedRow = sheet.getLastRow() + 1;
      sheet.getRange(savedRow, 1, 1, BOOKING_HEADERS.length).setValues([[
        payload.requestId,
        new Date(),
        payload.matric,
        studentEmail,
        payload.date,
        payload.time,
        payload.station,
        'Disahkan',
        'MENUNGGU'
      ]]);
      SpreadsheetApp.flush();
    } else {
      sheet = getOrCreateSheet_(spreadsheet, CONFIG.foodBankSheet, FOOD_BANK_HEADERS);
      duplicateResult = findDuplicate_(sheet, payload.requestId, 0);
      if (duplicateResult) return jsonResponse_(duplicateResult);

      const inventorySheet = getOrCreateInventorySheet_(spreadsheet);
      const inventoryRow = findInventoryRowByName_(inventorySheet, payload.item);
      if (!inventoryRow) return jsonResponse_({ ok: false, error: 'Item makanan tidak terdapat dalam inventori.' });
      const currentStock = Number(inventorySheet.getRange(inventoryRow, 4).getValue()) || 0;
      if (currentStock < payload.quantity) {
        return jsonResponse_({ ok: false, error: 'Stok item ini telah habis. Pilih item lain.' });
      }

      monthKey = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM');
      const used = getMonthlyUsage_(sheet, payload.matric, monthKey);
      if (used + payload.quantity > CONFIG.monthlyQuota) {
        return jsonResponse_({
          ok: false,
          error: 'Kuota Bulanan Anda Telah Habis!',
          remaining: Math.max(0, CONFIG.monthlyQuota - used)
        });
      }

      remainingQuota = CONFIG.monthlyQuota - used - payload.quantity;
      savedRow = sheet.getLastRow() + 1;
      sheet.getRange(savedRow, 1, 1, FOOD_BANK_HEADERS.length).setValues([[
        payload.requestId,
        new Date(),
        payload.matric,
        studentEmail,
        payload.item,
        payload.quantity,
        monthKey,
        remainingQuota
      ]]);
      inventorySheet.getRange(inventoryRow, 4).setValue(currentStock - payload.quantity);
      SpreadsheetApp.flush();
    }
  } catch (error) {
    console.error('Apps Script request failed before completing the write.', error);
    return jsonResponse_({ ok: false, error: error.message || 'Permintaan tidak dapat diproses.' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }

  if (payload.action === 'foodbank') {
    return jsonResponse_({
      ok: true,
      requestId: payload.requestId,
      remaining: remainingQuota,
      quota: CONFIG.monthlyQuota
    });
  }

  let emailSent = false;
  let emailError = '';
  try {
    const subject = 'Tempahan Dapur Madani UiTM berjaya — ' + payload.date;
    const body = [
      'Salam sejahtera,',
      '',
      'Tempahan stesen dapur anda telah direkodkan.',
      'No. matrik: ' + payload.matric,
      'Tarikh: ' + payload.date,
      'Slot masa: ' + payload.time,
      'Stesen: ' + payload.station,
      'Status: Disahkan',
      '',
      'Notifikasi ini dijana oleh prototaip Sistem Dapur Madani & Food Bank UiTM.'
    ].join('\n');
    GmailApp.sendEmail(
      studentEmail + ',' + adminEmail,
      subject,
      body,
      { name: 'Sistem Dapur Madani UiTM' }
    );
    emailSent = true;
  } catch (error) {
    emailError = error.message || 'Penghantaran emel gagal.';
    console.error('Booking saved, but GmailApp notification failed.', error);
  }

  try {
    sheet.getRange(savedRow, 9).setValue(emailSent ? 'BERJAYA' : 'GAGAL: ' + emailError);
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('Booking saved, but email status could not be updated in the Sheet.', error);
  }

  return jsonResponse_({
    ok: true,
    requestId: payload.requestId,
    emailSent: emailSent,
    message: emailSent
      ? 'Tempahan disimpan dan notifikasi emel dihantar.'
      : 'Tempahan disimpan tetapi notifikasi emel gagal dihantar.'
  });
}

function registerStudent_(payload) {
  const fullName = String(payload.fullName || '').trim();
  const ic = String(payload.ic || '').trim();
  const matric = String(payload.matric || '').trim();
  const password = String(payload.password || '');
  if (fullName.length < 2 || fullName.length > 100) return jsonResponse_({ ok: false, error: 'Nama penuh tidak sah.' });
  if (!/^\d{6}-\d{2}-\d{4}$/.test(ic)) return jsonResponse_({ ok: false, error: 'Format nombor IC tidak sah.' });
  if (!/^\d{10}$/.test(matric)) return jsonResponse_({ ok: false, error: 'No. matrik mesti mengandungi 10 digit.' });
  if (password.length < 8 || password.length > 128) return jsonResponse_({ ok: false, error: 'Kata laluan mesti antara 8 hingga 128 aksara.' });

  let lock;
  let sheet;
  let rowNumber;
  try {
    checkRateLimit_('register:' + matric, 5);
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonResponse_({ ok: false, error: 'Pelayan sedang sibuk. Sila cuba semula.' });
    sheet = getOrCreateSheet_(getSpreadsheet_(), CONFIG.registrationSheet, REGISTRATION_HEADERS);
    const existing = sheet.getLastRow() < 2 ? [] : sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getDisplayValues();
    if (existing.some(function (row) { return row[2] === matric || row[1] === ic; })) {
      return jsonResponse_({ ok: false, error: 'No. matrik atau nombor IC telah didaftarkan.' });
    }

    const salt = Utilities.getUuid();
    const passwordHash = hashPassword_(password, salt);
    rowNumber = sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, REGISTRATION_HEADERS.length).setValues([[
      fullName, ic, matric, matric + CONFIG.studentDomain, salt, passwordHash, new Date(), 'MENUNGGU'
    ]]);
    SpreadsheetApp.flush();
  } catch (error) {
    console.error('Student registration failed.', error);
    return jsonResponse_({ ok: false, error: error.message || 'Pendaftaran tidak dapat diproses.' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }

  let notificationSent = false;
  try {
    const adminEmail = String(PropertiesService.getScriptProperties().getProperty('ADMIN_EMAIL') || CONFIG.adminEmail).trim();
    GmailApp.sendEmail(
      adminEmail,
      'Pendaftaran pelajar baharu — Sistem Dapur Madani UiTM',
      'Pendaftaran pelajar baharu diterima.\nNama: ' + fullName + '\nNo. matrik: ' + matric +
        '\nE-mel: ' + matric + CONFIG.studentDomain + '\n\nNo. IC tidak disertakan dalam notifikasi.'
    );
    notificationSent = true;
  } catch (error) {
    console.error('Registration saved, but admin notification failed.', error);
  }
  try {
    sheet.getRange(rowNumber, 8).setValue(notificationSent ? 'BERJAYA' : 'GAGAL');
  } catch (error) {
    console.error('Could not update registration notification status.', error);
  }
  return jsonResponse_({
    ok: true,
    message: 'Pendaftaran berjaya direkodkan.',
    notificationSent: notificationSent
  });
}

function loginStudent_(payload) {
  const matric = String(payload.matric || '').trim();
  const password = String(payload.password || '');
  if (!/^\d{10}$/.test(matric) || !password) {
    return jsonResponse_({ ok: false, error: 'No. matrik atau kata laluan tidak tepat.' });
  }
  try {
    checkRateLimit_('login:' + matric, 10);
    const sheet = getOrCreateSheet_(getSpreadsheet_(), CONFIG.registrationSheet, REGISTRATION_HEADERS);
    const lastRow = sheet.getLastRow();
    if (lastRow < 2) return jsonResponse_({ ok: false, error: 'No. matrik atau kata laluan tidak tepat.' });
    const rows = sheet.getRange(2, 1, lastRow - 1, REGISTRATION_HEADERS.length).getValues();
    const account = rows.find(function (row) { return String(row[2]) === matric; });
    if (!account || hashPassword_(password, String(account[4])) !== String(account[5])) {
      return jsonResponse_({ ok: false, error: 'No. matrik atau kata laluan tidak tepat.' });
    }
    return jsonResponse_({ ok: true, name: String(account[0]), matric: matric });
  } catch (error) {
    console.error('Student login failed.', error);
    return jsonResponse_({ ok: false, error: 'Log masuk tidak dapat diproses. Cuba lagi sebentar lagi.' });
  }
}

function loginAdmin_(payload) {
  if (!hasValidAdminCredentials_(payload)) {
    return jsonResponse_({ ok: false, error: 'Username atau password admin tidak tepat.' });
  }
  return jsonResponse_({ ok: true, message: 'Admin disahkan.' });
}

function saveInventoryItem_(payload) {
  if (!hasValidAdminCredentials_(payload)) {
    return jsonResponse_({ ok: false, error: 'Sesi admin tidak sah. Log masuk semula.' });
  }
  const item = validateInventoryItem_(payload);
  if (!item) return jsonResponse_({ ok: false, error: 'Butiran item inventori tidak sah.' });
  let lock;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonResponse_({ ok: false, error: 'Pelayan sedang sibuk. Sila cuba semula.' });
    const sheet = getOrCreateInventorySheet_(getSpreadsheet_());
    const lastRow = sheet.getLastRow();
    if (lastRow >= 2) {
      const currentItems = sheet.getRange(2, 1, lastRow - 1, 2).getDisplayValues();
      const duplicateName = currentItems.some(function (row) {
        return row[0] !== item.id && row[1].trim().toLowerCase() === item.name.toLowerCase();
      });
      if (duplicateName) return jsonResponse_({ ok: false, error: 'Nama item tersebut sudah wujud dalam inventori.' });
    }
    const row = findInventoryRowById_(sheet, item.id);
    const rowNumber = row || sheet.getLastRow() + 1;
    sheet.getRange(rowNumber, 1, 1, INVENTORY_HEADERS.length).setValues([[
      item.id, item.name, item.category, item.quantity, new Date(item.expiry + 'T12:00:00'), new Date()
    ]]);
    SpreadsheetApp.flush();
    return jsonResponse_({
      ok: true,
      item: { id: item.id, name: item.name, category: item.category, quantity: item.quantity, expiry: item.expiry }
    });
  } catch (error) {
    console.error('Inventory save failed.', error);
    return jsonResponse_({ ok: false, error: error.message || 'Inventori tidak dapat disimpan.' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function deleteInventoryItem_(payload) {
  if (!hasValidAdminCredentials_(payload)) {
    return jsonResponse_({ ok: false, error: 'Sesi admin tidak sah. Log masuk semula.' });
  }
  const itemId = String(payload.itemId || '');
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(itemId)) {
    return jsonResponse_({ ok: false, error: 'ID item tidak sah.' });
  }
  let lock;
  try {
    lock = LockService.getScriptLock();
    if (!lock.tryLock(10000)) return jsonResponse_({ ok: false, error: 'Pelayan sedang sibuk. Sila cuba semula.' });
    const sheet = getOrCreateInventorySheet_(getSpreadsheet_());
    const row = findInventoryRowById_(sheet, itemId);
    if (!row) return jsonResponse_({ ok: false, error: 'Item tidak ditemui.' });
    sheet.deleteRow(row);
    SpreadsheetApp.flush();
    return jsonResponse_({ ok: true });
  } catch (error) {
    console.error('Inventory delete failed.', error);
    return jsonResponse_({ ok: false, error: error.message || 'Item tidak dapat dipadam.' });
  } finally {
    if (lock && lock.hasLock()) lock.releaseLock();
  }
}

function hasValidAdminCredentials_(payload) {
  const properties = PropertiesService.getScriptProperties();
  const username = String(properties.getProperty('ADMIN_USERNAME') || 'admin');
  const password = String(properties.getProperty('ADMIN_PASSWORD') || 'admin123');
  return String(payload.adminUsername || '') === username &&
    String(payload.adminPassword || '') === password;
}

function validateInventoryItem_(payload) {
  const id = String(payload.itemId || '');
  const name = String(payload.name || '').trim();
  const category = String(payload.category || '').trim();
  const quantity = Number(payload.quantity);
  const expiry = String(payload.expiry || '');
  const categories = ['Bijirin', 'Protein', 'Makanan dalam tin', 'Sayuran', 'Minuman', 'Keperluan asas', 'Lain-lain'];
  if (!/^[A-Za-z0-9_-]{1,80}$/.test(id) || name.length < 2 || name.length > 80) return null;
  if (categories.indexOf(category) === -1 || !Number.isInteger(quantity) || quantity < 0 || quantity > 100000) return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(expiry)) return null;
  const parts = expiry.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return null;
  return { id: id, name: name, category: category, quantity: quantity, expiry: expiry };
}

function getOrCreateInventorySheet_(spreadsheet) {
  let sheet = spreadsheet.getSheetByName(CONFIG.inventorySheet);
  const isNewSheet = !sheet;
  sheet = getOrCreateSheet_(spreadsheet, CONFIG.inventorySheet, INVENTORY_HEADERS);
  if (isNewSheet) {
    const rows = [
      ['FOOD-001', 'Beras 5 kg', 'Bijirin', 18, new Date('2027-06-18T12:00:00'), new Date()],
      ['FOOD-002', 'Minyak masak 1 kg', 'Keperluan asas', 12, new Date('2027-04-20T12:00:00'), new Date()],
      ['FOOD-003', 'Makanan dalam tin', 'Makanan dalam tin', 25, new Date('2027-08-22T12:00:00'), new Date()],
      ['FOOD-004', 'Mi segera (pek)', 'Bijirin', 30, new Date('2027-01-30T12:00:00'), new Date()]
    ];
    sheet.getRange(2, 1, rows.length, INVENTORY_HEADERS.length).setValues(rows);
  }
  return sheet;
}

function findInventoryRowById_(sheet, id) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const index = ids.findIndex(function (row) { return row[0] === id; });
  return index < 0 ? 0 : index + 2;
}

function findInventoryRowByName_(sheet, name) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const names = sheet.getRange(2, 2, lastRow - 1, 1).getDisplayValues();
  const index = names.findIndex(function (row) { return row[0] === name; });
  return index < 0 ? 0 : index + 2;
}

function hashPassword_(password, salt) {
  let digest = Utilities.computeDigest(
    Utilities.DigestAlgorithm.SHA_256,
    salt + password,
    Utilities.Charset.UTF_8
  );
  for (let iteration = 1; iteration < 12000; iteration += 1) {
    digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digest);
  }
  return digest.map(function (byte) {
    const value = (byte + 256) % 256;
    return ('0' + value.toString(16)).slice(-2);
  }).join('');
}

function formatSheetDate_(value) {
  if (Object.prototype.toString.call(value) === '[object Date]' && !isNaN(value.getTime())) {
    return Utilities.formatDate(value, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  }
  return String(value || '');
}

function validateRequest_(payload) {
  if (!payload || typeof payload !== 'object') return 'Badan permintaan tidak sah.';
  if (payload.action !== 'booking' && payload.action !== 'foodbank') return 'Jenis permintaan tidak disokong.';
  if (!/^\d{10}$/.test(String(payload.matric || ''))) return 'No. matrik mesti mengandungi 10 digit.';
  if (!/^[A-Za-z0-9_-]{8,80}$/.test(String(payload.requestId || ''))) return 'ID permintaan tidak sah.';

  if (payload.action === 'booking') {
    if (!isValidDate_(payload.date)) return 'Tarikh tempahan tidak sah atau telah berlalu.';
    if (CONFIG.allowedSlots.indexOf(payload.time) === -1) return 'Slot masa tidak disokong.';
    if (CONFIG.allowedStations.indexOf(payload.station) === -1) return 'Stesen dapur tidak disokong.';
    return '';
  }

  if (typeof payload.item !== 'string' || payload.item.trim().length < 2 || payload.item.length > 80) return 'Item makanan tidak disokong.';
  if (Number(payload.quantity) !== 1) return 'Kuantiti pengambilan mestilah satu unit.';
  return '';
}

function isValidDate_(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parts = value.split('-').map(Number);
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (date.getFullYear() !== parts[0] || date.getMonth() !== parts[1] - 1 || date.getDate() !== parts[2]) return false;
  const today = Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
  return value >= today;
}

function isEmail_(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function getSpreadsheet_() {
  const id = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || CONFIG.spreadsheetId;
  const spreadsheet = id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
  if (!spreadsheet) {
    throw new Error('ID Google Sheet tidak dikonfigurasikan.');
  }
  return spreadsheet;
}

function getOrCreateSheet_(spreadsheet, name, headers) {
  let sheet = spreadsheet.getSheetByName(name);
  if (!sheet) sheet = spreadsheet.insertSheet(name);

  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    sheet.setFrozenRows(1);
    return sheet;
  }

  const actual = sheet.getRange(1, 1, 1, headers.length).getDisplayValues()[0];
  if (headers.some(function (header, index) { return actual[index] !== header; })) {
    throw new Error('Tajuk lajur pada helaian "' + name + '" tidak sepadan. Gunakan helaian kosong atau betulkan baris pertama.');
  }
  return sheet;
}

function findDuplicate_(sheet, requestId, emailStatusColumn) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return null;
  const ids = sheet.getRange(2, 1, lastRow - 1, 1).getDisplayValues();
  const index = ids.findIndex(function (row) { return row[0] === requestId; });
  if (index === -1) return null;
  const rowNumber = index + 2;
  const result = {
    ok: true,
    requestId: requestId,
    duplicate: true,
    message: 'Permintaan ini telah direkodkan.'
  };
  if (emailStatusColumn) {
    const emailStatus = sheet.getRange(rowNumber, emailStatusColumn).getDisplayValue();
    result.emailSent = emailStatus === 'BERJAYA';
  }
  if (sheet.getName() === CONFIG.foodBankSheet) {
    result.remaining = Number(sheet.getRange(rowNumber, 8).getValue());
    result.quota = CONFIG.monthlyQuota;
  }
  return result;
}

function getMonthlyUsage_(sheet, matric, monthKey) {
  const lastRow = sheet.getLastRow();
  if (lastRow < 2) return 0;
  const rows = sheet.getRange(2, 1, lastRow - 1, FOOD_BANK_HEADERS.length).getValues();
  return rows.reduce(function (total, row) {
    if (String(row[2]) === matric && String(row[6]) === monthKey) {
      return total + Number(row[5] || 0);
    }
    return total;
  }, 0);
}

/**
 * Soft rate limit backed by script cache. Sheet quota validation is separately
 * serialized with LockService and remains the authoritative Food Bank limit.
 */
function checkRateLimit_(scope, limit) {
  const cache = CacheService.getScriptCache();
  const key = 'rate:' + scope;
  const current = Number(cache.get(key) || 0);
  if (current >= limit) {
    throw new Error('Had penggunaan sementara dicapai. Sila cuba lagi kemudian.');
  }
  cache.put(key, String(current + 1), CONFIG.cacheWindowSeconds);
}

function jsonResponse_(value) {
  return ContentService
    .createTextOutput(JSON.stringify(value))
    .setMimeType(ContentService.MimeType.JSON);
}
