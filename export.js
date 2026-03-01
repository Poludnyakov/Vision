(function () {
  'use strict';

  var supabase = typeof getSupabase === 'function' ? getSupabase() : null;
  var params = new URLSearchParams(window.location.search);
  var country = params.get('country') || 'schengen';
  var visaType = params.get('visa_type') || 'tourist';
  var submitted = params.get('submitted') === '1';

  var COUNTRY_NAMES = { schengen: 'Шенген', usa: 'США', uk: 'Великобритания', japan: 'Япония' };
  var VISA_NAMES = { tourist: 'Туристическая', business: 'Деловая', transit: 'Транзитная' };

  var subtitle = document.getElementById('export-subtitle');
  if (subtitle) subtitle.textContent = (COUNTRY_NAMES[country] || country) + ', ' + (VISA_NAMES[visaType] || visaType);

  document.getElementById('export-btn-logout').addEventListener('click', function () {
    if (typeof getSupabase === 'function') {
      var sb = getSupabase();
      if (sb) sb.auth.signOut();
    }
    window.location.href = 'index.html';
  });

  var navProfileTrigger = document.getElementById('nav-profile-trigger');
  var navProfileDropdown = document.getElementById('nav-profile-dropdown');
  if (navProfileTrigger && navProfileDropdown) {
    navProfileTrigger.addEventListener('click', function (e) {
      e.preventDefault();
      e.stopPropagation();
      var isOpen = !navProfileDropdown.hasAttribute('hidden');
      navProfileDropdown.toggleAttribute('hidden', isOpen);
      navProfileTrigger.setAttribute('aria-expanded', !isOpen);
    });
    document.addEventListener('click', function () {
      navProfileDropdown.setAttribute('hidden', '');
      navProfileTrigger.setAttribute('aria-expanded', 'false');
    });
  }

  // Показываем только блок для выбранной страны (данные привязаны к пользователю)
  document.querySelectorAll('.export-section[data-country]').forEach(function (el) {
    var sectionCountry = el.getAttribute('data-country');
    var show = (sectionCountry === 'usa' && country === 'usa') ||
      (sectionCountry === 'uk' && country === 'uk') ||
      (sectionCountry === 'other' && country !== 'usa' && country !== 'uk');
    el.style.display = show ? 'block' : 'none';
  });
  if (country === 'uk') {
    var ukBlankLink = document.getElementById('export-uk-blank');
    if (ukBlankLink) ukBlankLink.style.display = 'inline-flex';
  }

  if (country === 'usa') {
    function setUsaAppliedForUser() {
      var key = 'visa_assistant_usa_applied_anon';
      if (supabase) {
        supabase.auth.getUser().then(function (r) {
          var user = r.data && r.data.user;
          if (user && user.id) key = 'visa_assistant_usa_applied_' + user.id;
          try { localStorage.setItem(key, '1'); } catch (_) {}
        });
      } else {
        try { localStorage.setItem(key, '1'); } catch (_) {}
      }
    }
    setUsaAppliedForUser();
    var interviewBanner = document.getElementById('export-interview-banner');
    if (interviewBanner) interviewBanner.style.display = 'block';
  }
  if (submitted) {
    var statusBanner = document.getElementById('export-status-banner');
    if (statusBanner) statusBanner.style.display = 'block';
  }

  function getProfileFromSessionStorage() {
    try {
      var raw = sessionStorage.getItem('visa_export_profile');
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  }

  function fillFormsFromProfile(profile) {
    if (!profile || typeof profile !== 'object') return;
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var emp = profile.employment || {};
    var ukForm = document.getElementById('uk-form');
    if (ukForm) {
      if (pass.number) { var el = ukForm.elements['passport_number']; if (el) el.value = pass.number; }
      if (pass.issued_at) { var el = ukForm.elements['passport_issued_at']; if (el) el.value = pass.issued_at; }
      if (pass.expires_at) { var el = ukForm.elements['passport_expires_at']; if (el) el.value = pass.expires_at; }
      if (contact.email) { var el = ukForm.elements['contact_email']; if (el) el.value = contact.email; }
      if (contact.phone) { var el = ukForm.elements['contact_phone']; if (el) el.value = contact.phone; }
      if (p.marital_status) { var el = ukForm.elements['marital_status']; if (el) el.value = p.marital_status; }
      if (emp.income_amount) { var el = ukForm.elements['income_monthly']; if (el) el.value = String(emp.income_amount); }
    }
  }

  function loadProfileAndFillForms() {
    var profile = getProfileFromSessionStorage();
    if (profile) fillFormsFromProfile(profile);
    if (supabase) {
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) return;
        supabase.from('profiles').select('data').eq('user_id', user.id).maybeSingle()
          .then(function (res) {
            if (res.data && res.data.data) fillFormsFromProfile(res.data.data);
          });
      });
    }
  }

  loadProfileAndFillForms();

  function getExportDataForPdf() {
    var profile = getProfileFromSessionStorage();
    var ukForm = null;
    if (country === 'uk') {
      var f = document.getElementById('uk-form');
      if (f) {
        ukForm = {};
        f.querySelectorAll('input, select, textarea').forEach(function (el) {
          if (el.name) ukForm[el.name] = el.type === 'number' ? el.value : (el.value || '').trim();
        });
      }
    }
    return { profile: profile || {}, ukForm: ukForm };
  }

  /** UK colophon: vertical line, crest, title, barcode, GWF number. All vertically centered in header band. */
  function drawUkColophon(doc, gwf, pageW, margin, colophonOpts) {
    var opts = colophonOpts || {};
    var yTop = 6;
    var yBottom = 28;
    var bandCenter = (yTop + yBottom) / 2;

    doc.setDrawColor(0, 0, 0);
    doc.line(margin, yTop, pageW - margin, yTop);
    doc.setLineWidth(0.5);
    doc.line(margin, yTop, margin, yBottom);
    doc.setLineWidth(0.2);

    var leftX = margin + 4;
    var crestH = 16;
    var crestW = 22;
    if (opts.crestDataUrl) {
      try {
        doc.addImage(opts.crestDataUrl, 'PNG', leftX, bandCenter - crestH / 2, crestW, crestH);
        leftX += crestW + 2;
      } catch (e) { leftX += 2; }
    } else {
      leftX += 2;
    }
    doc.setFontSize(14);
    doc.setFont('helvetica', 'normal');
    doc.text('UK Visas & Immigration', leftX, bandCenter + 1.5);

    var barcodeW = 38;
    var barcodeH = 10;
    var barcodeX = pageW - margin - barcodeW;
    if (opts.barcodeDataUrl) {
      try {
        doc.addImage(opts.barcodeDataUrl, 'PNG', barcodeX, bandCenter - barcodeH / 2, barcodeW, barcodeH);
      } catch (e) {}
    }
    doc.setFontSize(9);
    doc.text(gwf, pageW - margin, bandCenter + barcodeH / 2 + 3, { align: 'right' });

    doc.line(margin, yBottom, pageW - margin, yBottom);
    return yBottom + 6;
  }

  function getUkBarcodeDataUrl(gwf) {
    if (typeof JsBarcode === 'undefined') return null;
    try {
      var canvas = document.createElement('canvas');
      JsBarcode(canvas, gwf, { format: 'CODE128', width: 1.2, height: 28, displayValue: false, margin: 0 });
      return canvas.toDataURL('image/png');
    } catch (e) {
      return null;
    }
  }

  function getUkCrestDataUrl(done) {
    var img = document.getElementById('uk-crest-pdf');
    if (img && img.complete && img.naturalWidth) {
      try {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        done(c.toDataURL('image/png'));
        return;
      } catch (e) {}
    }
    var loader = new Image();
    loader.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = loader.naturalWidth;
        c.height = loader.naturalHeight;
        c.getContext('2d').drawImage(loader, 0, 0);
        done(c.toDataURL('image/png'));
      } catch (e) {
        done(null);
      }
    };
    loader.onerror = function () { done(null); };
    loader.src = 'images/uk-coat-of-arms.png';
  }

  function getUsaSealDataUrl(done) {
    var img = document.getElementById('usa-seal-pdf');
    if (img && img.complete && img.naturalWidth) {
      try {
        var c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        done(c.toDataURL('image/png'), img.naturalWidth, img.naturalHeight);
        return;
      } catch (e) {}
    }
    var loader = new Image();
    loader.onload = function () {
      try {
        var c = document.createElement('canvas');
        c.width = loader.naturalWidth;
        c.height = loader.naturalHeight;
        c.getContext('2d').drawImage(loader, 0, 0);
        done(c.toDataURL('image/png'), loader.naturalWidth, loader.naturalHeight);
      } catch (e) {
        done(null, 0, 0);
      }
    };
    loader.onerror = function () { done(null, 0, 0); };
    loader.src = 'images/us-seal.png';
  }

  /** Schengen header (page 1 style): EU flag, centered title, instruction text. Returns y after header. */
  function drawSchengenFirstPageHeader(doc, pageW, margin, refNumber, barcodeDataUrl) {
    var y = 10;
    var flagW = 20;
    var flagH = 14;
    var flagX = (pageW - flagW) / 2;
    doc.setFillColor(0, 51, 153);
    doc.rect(flagX, y, flagW, flagH, 'F');
    var cx = flagX + flagW / 2;
    var cy = y + flagH / 2;
    doc.setFillColor(255, 204, 0);
    for (var i = 0; i < 12; i++) {
      var a = (270 + i * 30) * Math.PI / 180;
      doc.circle(cx + 4 * Math.cos(a), cy + 4 * Math.sin(a), 0.8, 'F');
    }
    y += flagH + 4;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('Application form for Schengen visa', pageW / 2, y, { align: 'center' });
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Free application form', pageW / 2, y, { align: 'center' });
    y += 6;
    var instr = 'Family members of EU, EEA or Swiss citizens or UK citizens who are beneficiaries of the Withdrawal Agreement do not fill in fields 21, 22, 30, 31 and 32 (marked with *). Fields 1-3 are filled in according to the travel document data.';
    doc.setFontSize(8);
    doc.text(doc.splitTextToSize(instr, pageW - 2 * margin), margin, y);
    y += doc.splitTextToSize(instr, pageW - 2 * margin).length * 4 + 6;
    if (barcodeDataUrl) {
      try {
        doc.addImage(barcodeDataUrl, 'PNG', pageW - margin - 30, 8, 28, 7);
        doc.setFontSize(8);
        doc.text(refNumber || 'SCH', pageW - margin, 18, { align: 'right' });
      } catch (e) {}
    }
    doc.line(margin, y, pageW - margin, y);
    return y + 4;
  }

  /** Draw right column: Photo box + FOR OFFICIAL USE ONLY block (like original form). */
  function drawSchengenRightColumn(doc, rightX, yStart, boxW, pageH) {
    var lineH = 4;
    doc.setDrawColor(0, 0, 0);
    doc.rect(rightX, yStart, boxW, 42, 'D');
    doc.setFontSize(8);
    doc.text('Photograph', rightX + boxW / 2, yStart + 4, { align: 'center' });
    var y = yStart + 46;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.text('FOR OFFICIAL USE ONLY', rightX, y);
    y += lineH;
    doc.text('FOR OFFICIAL REMARKS', rightX, y);
    y += lineH + 2;
    doc.setFont('helvetica', 'normal');
    doc.text('Date of application:', rightX, y);
    doc.line(rightX + 42, y - 1, rightX + boxW, y - 1);
    y += lineH + 2;
    doc.text('Application number:', rightX, y);
    doc.line(rightX + 42, y - 1, rightX + boxW, y - 1);
    y += lineH + 2;
    doc.text('Application lodged at:', rightX, y);
    y += lineH;
    doc.text('  Embassy/consulate   Service provider   Commercial intermediary', rightX, y);
    y += lineH;
    doc.text('  Border (Name):', rightX, y);
    doc.line(rightX + 28, y - 1, rightX + boxW, y - 1);
    y += lineH + 2;
    doc.text('File handled by:', rightX, y);
    doc.line(rightX + 32, y - 1, rightX + boxW, y - 1);
    y += lineH + 2;
    doc.text('Supporting documents:', rightX, y);
    y += lineH;
    doc.text('  Travel document   Means of subsistence   Invitation   TMI', rightX, y);
    y += lineH + 2;
    doc.text('Visa decision: Refused   Issued (A / C / LTV)   Valid From/Until', rightX, y);
    y += lineH + 2;
    doc.text('Number of entries: 1   2   Multiple   Number of days:', rightX, y);
  }

  /** Transliterate Cyrillic to Latin for PDF (jsPDF default font has no Cyrillic). */
  function transliterateForPdf(s) {
    if (!s || typeof s !== 'string') return s;
    var map = { '\u0430': 'a', '\u0431': 'b', '\u0432': 'v', '\u0433': 'g', '\u0434': 'd', '\u0435': 'e', '\u0451': 'e', '\u0436': 'zh', '\u0437': 'z', '\u0438': 'i', '\u0439': 'y', '\u043a': 'k', '\u043b': 'l', '\u043c': 'm', '\u043d': 'n', '\u043e': 'o', '\u043f': 'p', '\u0440': 'r', '\u0441': 's', '\u0442': 't', '\u0443': 'u', '\u0444': 'f', '\u0445': 'kh', '\u0446': 'ts', '\u0447': 'ch', '\u0448': 'sh', '\u0449': 'shch', '\u044a': '', '\u044b': 'y', '\u044c': '', '\u044d': 'e', '\u044e': 'yu', '\u044f': 'ya', '\u0410': 'A', '\u0411': 'B', '\u0412': 'V', '\u0413': 'G', '\u0414': 'D', '\u0415': 'E', '\u0401': 'E', '\u0416': 'Zh', '\u0417': 'Z', '\u0418': 'I', '\u0419': 'Y', '\u041a': 'K', '\u041b': 'L', '\u041c': 'M', '\u041d': 'N', '\u041e': 'O', '\u041f': 'P', '\u0420': 'R', '\u0421': 'S', '\u0422': 'T', '\u0423': 'U', '\u0424': 'F', '\u0425': 'Kh', '\u0426': 'Ts', '\u0427': 'Ch', '\u0428': 'Sh', '\u0429': 'Shch', '\u042a': '', '\u042b': 'Y', '\u042c': '', '\u042d': 'E', '\u042e': 'Yu', '\u042f': 'Ya' };
    return String(s).split('').map(function (c) { return map[c] != null ? map[c] : c; }).join('');
  }

  /** Schengen PDF matching original layout: two columns (applicant left, photo + official use right), fields 1-34, declaration page, signature page. */
  function buildSchengenTemplatePdf(doc, data) {
    var profile = data.profile || {};
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var addr = profile.address || {};
    var emp = profile.employment || {};
    var pageW = 210;
    var margin = 14;
    var leftColEndX = 116;
    var rightColX = 120;
    var rightColW = pageW - rightColX - margin;
    var lineH = 5;
    var dash = '-';

    function val(v) {
      if (v == null) return dash;
      var s = String(v).trim();
      return s === '' ? dash : transliterateForPdf(s);
    }

    var colophonOpts = data.schengenColophonOpts || {};
    var refNum = colophonOpts.refNumber || 'SCH-' + Date.now().toString(36).toUpperCase();
    var y = drawSchengenFirstPageHeader(doc, pageW, margin, refNum, colophonOpts.barcodeDataUrl);
    var yRightStart = y;
    drawSchengenRightColumn(doc, rightColX, yRightStart, rightColW, 60);

    function fieldLeft(num, label, value) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      doc.text(num + '. ' + label + (label.slice(-1) === ':' ? '' : ':'), margin, y);
      doc.setFont('helvetica', 'normal');
      doc.line(margin, y + 1, leftColEndX, y + 1);
      if (value != null && String(value).trim() !== '') {
        doc.setFontSize(9);
        doc.text(transliterateForPdf(String(value).trim()), leftColEndX - 1, y + 1, { align: 'right' });
      }
      y += lineH + 3;
    }
    function fieldLeftMultiline(num, label, value) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'bold');
      var lines = doc.splitTextToSize(num + '. ' + label + ':', leftColEndX - margin - 2);
      doc.text(lines, margin, y);
      doc.setFont('helvetica', 'normal');
      y += lines.length * lineH + 1;
      doc.line(margin, y, leftColEndX, y);
      if (value != null && String(value).trim() !== '') {
        doc.text(transliterateForPdf(String(value).trim()).substring(0, 70), leftColEndX - 1, y, { align: 'right' });
      }
      y += lineH + 3;
    }

    fieldLeft('1', 'Surname', p.last_name);
    fieldLeft('2', 'Surname at birth (previous surname(s))', null);
    fieldLeft('3', 'First name(s)', p.first_name);
    fieldLeft('4', 'Date of birth (day - month - year)', p.birth_date);
    fieldLeft('5', 'Place of birth', p.birth_place);
    fieldLeft('6', 'Country of birth', p.birth_country || profile.citizenship);
    fieldLeft('7', 'Current nationality', p.citizenship || profile.citizenship);
    fieldLeft('', 'Nationality at birth, if different', null);
    fieldLeft('', 'Other nationality', null);
    fieldLeft('8', 'Sex', p.gender);
    fieldLeft('9', 'Marital status', p.marital_status);
    fieldLeftMultiline('10', 'For minors: surname, first name, address, phone, email and nationality of legal guardian', null);
    fieldLeft('11', 'Identification number (if any)', null);
    fieldLeft('12', 'Type of travel document', 'Ordinary passport');
    fieldLeft('13', 'Travel document number', pass.number);
    fieldLeft('14', 'Date of issue', pass.issued_at);
    fieldLeft('15', 'Valid until', pass.expires_at);
    fieldLeft('16', 'Issued by (country)', pass.issuing_country);
    fieldLeftMultiline('17', 'Personal data of EU/EEA/Swiss family member (if applicable). Surname, First name(s), Date of birth, Nationality, Document number', null);

    if (y > 270) {
      doc.addPage();
      y = margin + 8;
      doc.setFontSize(10);
      doc.text('-- 2 --', pageW / 2, y, { align: 'center' });
      y += 10;
    }

    fieldLeftMultiline('18', 'Family relationship with EU, EEA or Swiss citizen', null);
    fieldLeft('19', 'Home address and email', addr.line || addr.street);
    fieldLeft('', 'Phone number', contact.phone);
    fieldLeft('20', 'Country of residence (if not country of nationality)', addr.country);
    fieldLeft('*21', 'Current occupation', emp.position || emp.status);
    fieldLeftMultiline('*22', 'Employer(s): address and phone. For students: name and address of school', emp.employer_name);
    fieldLeft('23', 'Purpose(s) of travel', visaType === 'business' ? 'Business' : visaType === 'transit' ? 'Transit' : 'Tourism');
    fieldLeft('24', 'Additional information on purpose', null);
    fieldLeft('25', 'Main destination country (and other countries)', null);
    fieldLeft('26', 'Country of first entry', null);
    fieldLeft('27', 'Visa requested for', 'single entry');
    fieldLeft('28', 'Intended date of entry', null);
    fieldLeft('', 'Intended date of exit', null);
    fieldLeft('29', 'Fingerprints provided previously', null);
    fieldLeft('30', 'Permission to enter final destination country', null);
    fieldLeftMultiline('*31', 'Surname and first name of inviting person(s) / hotel or accommodation address', null);
    fieldLeft('', 'Address and email of inviting person / hotel', null);
    fieldLeft('', 'Phone number', contact.phone);
    fieldLeftMultiline('*32', 'Name and address of inviting company/organisation', null);

    if (y > 265) {
      doc.addPage();
      y = margin + 8;
      doc.setFontSize(10);
      doc.text('-- 3 --', pageW / 2, y, { align: 'center' });
      y += 10;
    }

    fieldLeft('*33', 'Travel and accommodation expenses paid by', 'Applicant');
    fieldLeft('', 'Means: cash, traveller\'s cheques, card, prepaid accommodation/transport, other', null);
    fieldLeft('34', 'Surname and first name of person filling the form (if not applicant)', null);
    fieldLeft('', 'Address and email of person filling the form', null);
    fieldLeft('', 'Phone number', null);

    y += 4;
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    var decl = 'I am informed that the visa fee is non-refundable in case of refusal. I am informed that appropriate travel medical insurance is required for stays in the Schengen States. I am informed and agree that the personal data, photograph and fingerprints requested in this form are mandatory for processing my application and will be transmitted to the competent authorities of the Schengen States. These data and the decision on my application will be stored in the Visa Information System (VIS) for up to five years and may be used by border, immigration and asylum authorities for checks and investigations. I am aware of my right to access, rectify or delete my data in the VIS; complaints may be lodged with the national data protection authority. I certify that the information given is accurate and complete. I am aware that false data may lead to refusal or annulment of the visa and to prosecution. If a visa is issued, I undertake to leave the Schengen territory before the visa expires. I am informed that a visa does not guarantee entry and that I am subject to checks at the border under the Schengen Borders Code.';
    doc.text(doc.splitTextToSize(decl, pageW - 2 * margin), margin, y);
    y += doc.splitTextToSize(decl, pageW - 2 * margin).length * 3.5 + 12;

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.text('Place and date:', margin, y);
    doc.line(margin + 32, y - 1, leftColEndX, y - 1);
    doc.text('Signature:', rightColX, y);
    doc.rect(rightColX + 24, y - 4, 35, 10, 'D');
    y += 6;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.text('(if applicable: signature of person with parental/legal guardian authority)', margin, y);
  }

  /** Japan visa application PDF: layout like official form (photo + official use right), fields from profile, page 2 guarantor/inviter/declaration/signature. */
  function buildJapanTemplatePdf(doc, data) {
    var profile = data.profile || {};
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var addr = profile.address || {};
    var emp = profile.employment || {};
    var pageW = 210;
    var margin = 14;
    var leftColEndX = 118;
    var rightColX = 122;
    var rightColW = pageW - rightColX - margin;
    var lineH = 5;
    var dash = '-';

    function val(v) {
      if (v == null) return dash;
      var s = String(v).trim();
      return s === '' ? dash : transliterateForPdf(s);
    }

    var y = 12;
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('VISA APPLICATION FORM TO ENTER JAPAN', pageW / 2, y, { align: 'center' });
    y += 8;

    doc.rect(rightColX, y, rightColW, 42, 'D');
    doc.setFontSize(8);
    doc.setFont('helvetica', 'normal');
    doc.text('(Paste photo here)', rightColX + rightColW / 2, y + 18, { align: 'center' });
    doc.text('45mm x 45mm or 2in x 2in', rightColX + rightColW / 2, y + 26, { align: 'center' });
    doc.rect(rightColX, y + 44, rightColW, 12, 'D');
    doc.text('*Official use only', rightColX + rightColW / 2, y + 51, { align: 'center' });

    var yLeft = y;
    function fl(label, value) {
      doc.setFontSize(9);
      doc.setFont('helvetica', 'normal');
      doc.text(label + ':', margin, yLeft);
      doc.line(margin, yLeft + 1, leftColEndX, yLeft + 1);
      if (value != null && String(value).trim() !== '') {
        doc.text(transliterateForPdf(String(value).trim()).substring(0, 55), leftColEndX - 1, yLeft + 1, { align: 'right' });
      }
      yLeft += lineH + 2;
    }
    function fl2(leftLabel, leftVal, rightLabel, rightVal) {
      var mid = margin + (leftColEndX - margin) / 2;
      doc.setFontSize(9);
      doc.text(leftLabel + ':', margin, yLeft);
      doc.line(margin + 42, yLeft + 1, mid - 2, yLeft + 1);
      if (leftVal != null && String(leftVal).trim() !== '') doc.text(transliterateForPdf(String(leftVal).trim()), mid - 3, yLeft + 1, { align: 'right' });
      doc.text(rightLabel + ':', mid + 2, yLeft);
      doc.line(mid + 38, yLeft + 1, leftColEndX, yLeft + 1);
      if (rightVal != null && String(rightVal).trim() !== '') doc.text(transliterateForPdf(String(rightVal).trim()), leftColEndX - 1, yLeft + 1, { align: 'right' });
      yLeft += lineH + 2;
    }

    fl('Surname (as shown in passport)', p.last_name);
    fl('Given and middle names (as shown in passport)', p.first_name);
    fl('Other names (including any other names you are or have been known by)', null);
    fl2('Date of birth', p.birth_date, 'Place of birth', p.birth_place);
    fl('(City) / (State or Province) / (Country)', null);
    doc.text('Sex: Male  Female', margin, yLeft);
    doc.line(margin + 55, yLeft + 1, leftColEndX, yLeft + 1);
    if (p.gender) doc.text(val(p.gender), leftColEndX - 1, yLeft + 1, { align: 'right' });
    yLeft += lineH + 2;
    doc.text('Marital status: Single  Married  Widowed  Divorced', margin, yLeft);
    doc.line(margin + 75, yLeft + 1, leftColEndX, yLeft + 1);
    yLeft += lineH + 2;
    fl('Nationality or citizenship', p.citizenship || profile.citizenship);
    fl('Former and/or other nationalities or citizenships', null);
    fl('ID No. issued to you by your government', null);
    doc.text('Passport type: Diplomatic  Official  Ordinary  Other', margin, yLeft);
    doc.line(margin + 72, yLeft + 1, leftColEndX, yLeft + 1);
    doc.text('Ordinary', leftColEndX - 1, yLeft + 1, { align: 'right' });
    yLeft += lineH + 2;
    fl('Passport No.', pass.number);
    fl2('Place of issue', pass.place_of_issue, 'Issuing authority', pass.issuing_country);
    fl2('Date of issue', pass.issued_at, 'Date of expiry', pass.expires_at);
    fl('Purpose of visit to Japan', visaType === 'business' ? 'Business' : visaType === 'transit' ? 'Transit' : 'Tourism');
    fl('Intended length of stay in Japan', null);
    fl('Date of arrival in Japan', null);
    fl2('Port of entry into Japan', null, 'Name of ship or airline', null);
    fl('Names and addresses of hotels or persons with whom applicant intends to stay', null);
    doc.text('Name', margin, yLeft);
    doc.text('Tel.', margin + 50, yLeft);
    doc.text('Address', margin + 75, yLeft);
    yLeft += 3;
    doc.line(margin, yLeft, leftColEndX, yLeft);
    yLeft += lineH + 2;
    fl('Dates and duration of previous stays in Japan', null);
    fl('Your current residential address (if you have more than one address, please list them all)', addr.line || addr.street);
    doc.text('Address', margin, yLeft);
    doc.text('Tel.', margin + 50, yLeft);
    doc.text('Mobile No.', margin + 75, yLeft);
    doc.line(margin, yLeft + 1, leftColEndX, yLeft + 1);
    doc.text(contact.phone || dash, leftColEndX - 1, yLeft + 1, { align: 'right' });
    yLeft += lineH + 2;
    fl('Current profession or occupation and position', emp.position || emp.status);
    fl('Name and address of employer', emp.employer_name);
    doc.text('Name', margin, yLeft);
    doc.text('Tel.', margin + 50, yLeft);
    doc.text('Address', margin + 75, yLeft);
    doc.line(margin, yLeft + 1, leftColEndX, yLeft + 1);
    yLeft += lineH + 4;

    doc.addPage();
    var y2 = margin + 6;
    doc.setFontSize(10);
    doc.text('-- 2 of 2 --', pageW / 2, y2, { align: 'center' });
    y2 += 10;

    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    doc.text('*Partner\'s profession/occupation (or that of parents, if applicant is a minor):', margin, y2);
    doc.line(margin, y2 + 1, pageW - margin, y2 + 1);
    y2 += lineH + 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Guarantor or reference in Japan (Please provide details of the guarantor or the person to be visited in Japan)', margin, y2);
    y2 += lineH + 2;
    doc.setFont('helvetica', 'normal');
    doc.text('Name', margin, y2);
    doc.text('Tel.', margin + 55, y2);
    doc.line(margin + 18, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Address', margin, y2);
    doc.line(margin + 22, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Date of birth (Day)/(Month)/(Year)', margin, y2);
    doc.line(margin + 55, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Sex: Male  Female', margin, y2);
    doc.line(margin + 38, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Relationship to applicant:', margin, y2);
    doc.line(margin + 52, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Profession or occupation and position:', margin, y2);
    doc.line(margin + 72, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Nationality and immigration status:', margin, y2);
    doc.line(margin + 65, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 4;
    doc.setFont('helvetica', 'bold');
    doc.text('Inviter in Japan (Please write \'same as above\' if the inviting person and the guarantor are the same)', margin, y2);
    y2 += lineH + 2;
    doc.setFont('helvetica', 'normal');
    doc.text('Name', margin, y2);
    doc.text('Tel.', margin + 55, y2);
    doc.line(margin + 18, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Address', margin, y2);
    doc.line(margin + 22, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Date of birth (Day)/(Month)/(Year)', margin, y2);
    doc.line(margin + 55, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Sex: Male  Female', margin, y2);
    doc.line(margin + 38, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Relationship to applicant:', margin, y2);
    doc.line(margin + 52, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Profession or occupation and position:', margin, y2);
    doc.line(margin + 72, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 2;
    doc.text('Nationality and immigration status:', margin, y2);
    doc.line(margin + 65, y2 + 1, leftColEndX, y2 + 1);
    y2 += lineH + 4;
    doc.text('*Remarks/Special circumstances, if any', margin, y2);
    doc.line(margin, y2 + 1, pageW - margin, y2 + 1);
    y2 += lineH + 6;
    doc.setFont('helvetica', 'bold');
    doc.text('Have you ever:', margin, y2);
    y2 += lineH + 2;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    var bullets = [
      'been convicted of a crime or offence in any country?',
      'been sentenced to imprisonment for 1 year or more in any country?**',
      'been deported or removed from Japan or any country for overstaying your visa or violating any law or regulation?',
      'been convicted and sentenced for a drug offence in any country in violation of law concerning narcotics, marijuana, opium, stimulants or psychotropic substances?**',
      'engaged in prostitution, or in the intermediation or solicitation of a prostitute for other persons, or in the provision of a place for prostitution, or any other activity directly connected to prostitution?',
      'committed trafficking in persons or incited or aided another to commit such an offence?'
    ];
    bullets.forEach(function (b) {
      doc.text('  ' + b, margin, y2);
      doc.text('Yes  No', pageW - margin - 28, y2);
      y2 += lineH + 1;
    });
    y2 += 2;
    doc.text('** Please tick "Yes" if you have received any sentence, even if the sentence was suspended.', margin, y2);
    y2 += lineH + 2;
    doc.text('If you answered "Yes" to any of the above questions, please provide relevant details.', margin, y2);
    y2 += lineH + 2;
    doc.rect(margin, y2, pageW - 2 * margin, 18, 'D');
    y2 += 22;
    doc.setFontSize(8);
    doc.text('"I hereby declare that the statement given above is true and correct. I understand that immigration status and period of stay to be granted are decided by the Japanese immigration authorities upon my arrival. I understand that possession of a visa does not entitle the bearer to enter Japan upon arrival at port of entry if he or she is found inadmissible."', margin, y2, { maxWidth: pageW - 2 * margin });
    y2 += 14;
    doc.text('"I hereby consent to the provision of my personal information (by an accredited travel agent, within its capacity of representing my visa application) to the Japanese embassy/consulate-general and (entrust the agent with) the payment of my visa fee to the Japanese embassy/consulate-general, when such payment is necessary."', margin, y2, { maxWidth: pageW - 2 * margin });
    y2 += 14;
    doc.setFontSize(9);
    doc.text('Date of application', margin, y2);
    doc.text('(Day)/(Month)/(Year)', margin, y2 + 4);
    doc.line(margin + 42, y2 + 3, margin + 85, y2 + 3);
    doc.text('Signature of applicant', rightColX, y2);
    doc.line(rightColX + 42, y2 + 3, pageW - margin, y2 + 3);
    y2 += 12;
    doc.setFontSize(7);
    doc.text('* It is not mandatory to complete these items.', margin, y2);
    y2 += 5;
    doc.text('Any personal information gathered in this application as well as additional information submitted for the visa application (hereinafter referred to as "Retained Personal Information") will be handled appropriately in accordance with the Act on the Protection of Personal Information Held by Administrative Organs (Act No. 58 of 2003). Retained Personal Information will only be used for the purpose of processing the visa application and to the extent necessary for the purposes stated in Article 8 of the Act.', margin, y2, { maxWidth: pageW - 2 * margin });
  }

  /** USA colophon: seal top-left, horizontal line, page number centered. Seal from sealDataUrl (aspect ratio preserved) or drawn circle + "U.S.". */
  function drawUsaColophon(doc, pageW, margin, pageNum, totalPages, sealDataUrl, sealImgW, sealImgH) {
    var yTop = 6;
    var yBottom = 24;
    var bandCenter = (yTop + yBottom) / 2;
    var sealSize = 18;
    var leftX = margin + 2;
    if (sealDataUrl && sealImgW > 0 && sealImgH > 0) {
      try {
        var maxMm = sealSize;
        var r = sealImgW / sealImgH;
        var drawW = r >= 1 ? maxMm : maxMm * r;
        var drawH = r >= 1 ? maxMm / r : maxMm;
        doc.addImage(sealDataUrl, 'PNG', leftX, bandCenter - drawH / 2, drawW, drawH);
        leftX += drawW + 4;
      } catch (e) {
        leftX += 2;
      }
    } else if (sealDataUrl) {
      try {
        doc.addImage(sealDataUrl, 'PNG', leftX, bandCenter - sealSize / 2, sealSize, sealSize);
        leftX += sealSize + 4;
      } catch (e) {
        leftX += 2;
      }
    }
    if (!sealDataUrl) {
      var cx = leftX + sealSize / 2;
      var cy = bandCenter;
      doc.setDrawColor(0, 0, 0);
      doc.setLineWidth(0.4);
      doc.circle(cx, cy, sealSize / 2 - 1);
      doc.circle(cx, cy, sealSize / 4);
      doc.setLineWidth(0.2);
      doc.setFontSize(6);
      doc.setFont('helvetica', 'bold');
      doc.text('U.S.', cx - 2.5, cy + 1);
      doc.setFont('helvetica', 'normal');
      leftX += sealSize + 4;
    }
    doc.setDrawColor(0, 0, 0);
    doc.line(margin, yTop, pageW - margin, yTop);
    doc.line(margin, yBottom, pageW - margin, yBottom);
    doc.setFontSize(9);
    doc.text('-- ' + pageNum + ' of ' + totalPages + ' --', pageW / 2, bandCenter + 1.5, { align: 'center' });
    return yBottom + 6;
  }

  /** US visa questionnaire (DS-160 style): 8-page structure, sections 1-20, English labels, dash for missing, data from profile. */
  function buildUsaTemplatePdf(doc, data) {
    var profile = data.profile || {};
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var addr = profile.address || {};
    var emp = profile.employment || {};
    var pageW = 210;
    var margin = 14;
    var lineH = 5;
    var dash = '-';
    var pageNum = 1;
    var totalPages = 8;
    var usaOpts = data.usaColophonOpts || {};
    var sealDataUrl = usaOpts.sealDataUrl || null;
    var sealImgW = usaOpts.sealImgW || 0;
    var sealImgH = usaOpts.sealImgH || 0;

    function v(x) {
      if (x == null) return dash;
      var s = String(x).trim();
      return s === '' ? dash : transliterateForPdf(s);
    }
    function newPage() {
      doc.addPage();
      pageNum++;
      y = drawUsaColophon(doc, pageW, margin, pageNum, totalPages, sealDataUrl, sealImgW, sealImgH);
    }
    function sectionTitle(title) {
      if (y > 268) newPage();
      y += 3;
      doc.setFontSize(10);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, y);
      doc.setFont('helvetica', 'normal');
      y += lineH + 1;
    }
    function fl(label, value) {
      if (y > 272) newPage();
      doc.setFontSize(9);
      doc.text(label + ':', margin, y);
      doc.line(margin, y + 1, pageW - margin, y + 1);
      if (value != null && String(value).trim() !== '') doc.text(v(value).substring(0, 90), pageW - margin - 1, y + 1, { align: 'right' });
      y += lineH + 2;
    }
    function yesNo(q) {
      if (y > 270) newPage();
      var lines = doc.splitTextToSize(q, pageW - 2 * margin - 25);
      doc.setFontSize(9);
      doc.text(lines, margin, y);
      y += lines.length * lineH;
      doc.text('No  Yes', pageW - margin - 28, y - 1);
      doc.line(margin, y + 1, pageW - margin, y + 1);
      y += lineH + 1;
      doc.setFontSize(8);
      doc.text('If you answered "Yes", please explain:', margin, y);
      doc.line(margin + 52, y + 1, pageW - margin, y + 1);
      y += lineH + 3;
    }

    var y = drawUsaColophon(doc, pageW, margin, 1, totalPages, sealDataUrl, sealImgW, sealImgH);
    doc.setFontSize(14);
    doc.setFont('helvetica', 'bold');
    doc.text('US VISA QUESTIONNAIRE (DS-160 form)', pageW / 2, y + 2, { align: 'center' });
    y += 10;

    sectionTitle('1. Personal information');
    fl('1.1. Full name (as in passport)', (p.last_name || '') + ' ' + (p.first_name || ''));
    fl('1.2. Full name in native language', null);
    fl('1.3. Have you ever used other names (maiden name, pseudonym, etc.)', null);
    doc.text('1.4. Sex: M  F', margin, y);
    doc.line(margin + 28, y + 1, pageW - margin, y + 1);
    if (p.gender) doc.text(v(p.gender), pageW - margin - 1, y + 1, { align: 'right' });
    y += lineH + 2;
    fl('1.5. Marital status', p.marital_status);
    fl('1.6. Date of birth', p.birth_date);
    fl('1.7. City of birth', p.birth_place);
    fl('1.8. Region of birth', null);
    fl('1.9. Country of birth', p.birth_country || profile.citizenship);
    fl('1.10. Citizenship', p.citizenship || profile.citizenship);
    fl('1.11. Have you ever had citizenship other than above', null);

    sectionTitle('2. Contact information');
    fl('2.1. Residential address', addr.line || addr.street);
    fl('2.2. Country', addr.country);
    fl('2.3. Postal code', addr.postal_code);
    fl('2.4. State/Region/Province', addr.region);
    fl('2.5. City', addr.city);
    fl('2.6. Street', addr.street);
    fl('2.7. House, apt.', null);
    fl('2.8. Phones', contact.phone);
    fl('2.9. Email address', contact.email);
    fl('2.10. Social media (username and network name)', null);

    sectionTitle('3. Passport');
    fl('3.1. Passport number', pass.number);
    fl('3.2. Country of passport issuance', pass.issuing_country);
    fl('3.3. Place of passport issuance', pass.place_of_issue);
    fl('3.4. Country', null);
    fl('3.5. State/Region/Province', null);
    fl('3.6. City', null);
    fl('3.7. Date of passport issuance', pass.issued_at);
    fl('3.8. Passport expiry date', pass.expires_at);
    fl('3.9. Has your passport ever been lost or stolen', null);

    sectionTitle('4. Purpose of trip to USA');
    fl('4.1. Are you the primary applicant', null);
    fl('4.1.1. Purpose of trip to USA', visaType === 'business' ? 'Business' : visaType === 'transit' ? 'Transit' : 'Tourism');
    fl('4.2. Do you have a specific program of stay in the USA', null);
    fl('4.2.1. Proposed date of entry to USA', null);
    fl('4.2.2. Proposed duration of stay in USA', null);
    fl('4.3. Address where you plan to stay in the USA', null);
    fl('4.3.1. State', null);
    fl('4.3.2. Postal code', null);
    fl('4.3.3. City', null);

    if (y > 260) newPage();
    fl('4.3.4. Street', null);
    fl('4.3.5. House, apt.', null);
    doc.text('4.4. Who is paying for your trip:  Self  Other person:', margin, y);
    doc.line(margin + 55, y + 1, pageW - margin, y + 1);
    y += lineH + 3;

    sectionTitle('5. Persons accompanying you on the trip');
    fl('5.1. Full name of accompanying person (as in passport)', null);
    fl('5.2. Relationship to applicant', null);

    sectionTitle('6. Previous trips to the USA');
    fl('6.1. Have you been to the USA before', null);
    fl('6.1.1. Last 5 trips (arrival date, days): 1)', null);
    fl('', null);
    fl('2)', null);
    fl('3)', null);
    fl('4)', null);
    fl('5)', null);
    yesNo('6.2. Do you have or have you ever had a US driver\'s license?');
    yesNo('6.3. Have you ever been issued a US visa?');
    fl('6.3.1. Date of issue of last visa', null);
    fl('6.3.2. Visa number', null);
    yesNo('6.4. Are you currently applying for the same type of visa?');
    yesNo('6.5. Applying in the same country as before and is it your country of residence?');
    yesNo('6.6. Have you undergone 10-fingerprint scanning?');
    yesNo('6.7. Has your visa ever been lost or stolen?');
    yesNo('6.8. Has your visa ever been annulled?');
    yesNo('6.9. Have you ever been denied a US visa or entry to the USA?');
    yesNo('6.10. Has your application for entry to the USA ever been withdrawn?');
    yesNo('6.11. Has anyone ever applied for an immigrant visa on your behalf?');

    sectionTitle('7. Inviting party in the USA');
    fl('7.1.1. Full name', null);
    fl('7.1.2. Organization', null);
    fl('7.1.3. Relationship to you', null);
    fl('7.2.1. Postal code', null);
    fl('7.2.2. State', null);
    fl('7.2.3. City', null);
    fl('7.2.4. Street', null);
    fl('7.2.5. House, apt.', null);
    fl('7.2.6. Phone', null);
    fl('7.2.7. Email address', null);

    sectionTitle('8. Family: relatives');
    fl('8.1. Father\'s full name', null);
    fl('8.2. Date of birth', null);
    yesNo('8.3. Is your father in the USA?');
    fl('8.4. Mother\'s full name', null);
    fl('8.5. Date of birth', null);
    yesNo('8.6. Is your mother in the USA?');
    yesNo('8.7. Is any relative (other than parents) in the USA?');

    sectionTitle('9. Family: spouse');
    fl('9.1. Spouse\'s full name', null);
    fl('9.2. Address of residence', null);
    fl('9.3. Passport number', null);

    sectionTitle('10. Current employment/study/internship');
    fl('10.2. Name of employer company/educational institution', emp.employer_name);
    fl('10.3.1. Country', null);
    fl('10.3.2. Postal code', null);
    fl('10.3.3. State/Region/Province', null);
    fl('10.3.4. City', null);
    fl('10.3.5. Street', null);
    fl('10.3.6. House, office', null);
    fl('10.4. Monthly salary in local currency', emp.income_amount ? emp.income_amount + ' ' + (emp.income_currency || '') : null);
    fl('10.5. Brief description of your duties', emp.position);

    sectionTitle('11. Previous employment/study (last 10 years)');
    yesNo('11.1. Have you worked before?');
    var jobLabels = ['Employer company', 'Employer address', 'Phone', 'Position', 'Supervisor full name', 'Date of employment', 'Date of dismissal', 'Brief description of duties'];
    for (var j = 1; j <= 5; j++) {
      if (y > 270) newPage();
      doc.setFont('helvetica', 'bold');
      doc.text('Job ' + j + ':', margin, y);
      doc.setFont('helvetica', 'normal');
      y += lineH + 1;
      jobLabels.forEach(function (l) { fl('11.1. ' + l, null); });
    }
    yesNo('11.2. Did you study at an educational institution (other than primary school)?');
    for (var sch = 1; sch <= 2; sch++) {
      if (y > 268) newPage();
      doc.setFont('helvetica', 'bold');
      doc.text('Educational institution ' + sch + ':', margin, y);
      doc.setFont('helvetica', 'normal');
      y += lineH + 1;
      fl('11.2.1. Name of institution', null);
      fl('11.2.2. Country', null);
      fl('11.2.3. Postal code', null);
      fl('11.2.4. State/Region/Province', null);
      fl('11.2.5. City', null);
      fl('11.2.6. Street', null);
      fl('11.2.7. House, office', null);
      fl('11.2.8. Specialization', null);
      fl('11.2.9. Date of entry', null);
      fl('11.2.10. Date of graduation', null);
    }

    sectionTitle('12. Additional information');
    yesNo('12.1. Do you belong to a specific clan or tribe?');
    fl('12.2. What languages do you speak', null);
    yesNo('12.3. Have you traveled to other countries in the last 5 years?');
    fl('If Yes, list countries visited', null);
    yesNo('12.4. Have you belonged to or worked for any professional, public or charitable organization?');
    fl('If Yes, list organizations', null);
    yesNo('12.5. Do you have special knowledge/skills in armaments, explosives, or nuclear/biological/chemical areas?');
    yesNo('12.6. Have you served in the army?');
    fl('12.6.1. Country of service', null);
    fl('12.6.2. Branch of service', null);
    fl('12.6.3. Rank/position', null);
    fl('12.6.4. Military specialty', null);
    fl('12.6.5. Date of start of service', null);
    fl('12.6.6. Date of end of service', null);
    yesNo('12.7. Have you ever served in or been involved in paramilitary, rebel or insurgent formations?');

    sectionTitle('13. Medical and health information');
    yesNo('13.1. Do you have infectious diseases that pose a threat to public health (e.g. active tuberculosis)?');
    yesNo('13.2. Do you suffer from mental or physical disorders that threaten your or others\' safety?');
    yesNo('13.3. Do you use or have you ever used drugs? Are you or have you ever been drug-dependent?');

    sectionTitle('14. Criminal information');
    yesNo('14.1. Have you ever been arrested or convicted of a crime (even if pardoned, amnestied)?');
    yesNo('14.2. Have you ever violated the law or been involved in illegal circulation of controlled substances?');
    yesNo('14.3. Is prostitution or facilitating prostitution the purpose of your trip? Have you engaged in prostitution or pimping in the last 10 years?');
    yesNo('14.4. Have you ever been involved in or do you intend to participate in money laundering?');
    yesNo('14.5. Have you committed or do you intend to commit a crime related to human trafficking in or outside the USA?');
    yesNo('14.6. Are you the spouse or child of someone who committed such a crime and have you benefited from it in the last 5 years?');
    yesNo('14.7. Have you ever aided, abetted, or conspired with a person who committed or intended to commit human trafficking?');

    sectionTitle('15. Security questions');
    yesNo('15.1. Do you intend to enter the USA to violate export controls, conduct espionage or sabotage?');
    yesNo('15.2. Have you ever been involved or do you intend to participate in terrorist activity in the USA?');
    yesNo('15.3. Have you ever provided or do you intend to provide financial or other support to terrorists or terrorist organizations?');
    yesNo('15.4. Are you a member or representative of a terrorist organization?');
    yesNo('15.5. Have you ever participated in genocide policy?');
    yesNo('15.6. Have you ever participated in torture?');
    yesNo('15.7. Have you ever participated in murders (including political) or similar acts of violence?');
    yesNo('15.8. Have you ever participated in recruiting or using children as soldiers?');
    yesNo('15.9. Have you been responsible for or directly participated in serious crimes on religious grounds while in government?');
    yesNo('15.10. Have you been involved in forced birth control, forced abortions or sterilizations?');
    yesNo('15.11. Have you participated in forced organ or tissue transplantation?');

    sectionTitle('16. Immigration law violations');
    yesNo('16.1. Have you ever been denied entry to the USA or been accused in a deportation case?');
    yesNo('16.2. Have you ever tried to obtain a US visa or help others obtain one by fraud or false information?');
    yesNo('16.3. In the last 5 years, have you avoided deportation hearings or been unable to enter the USA?');
    yesNo('16.4. Have you ever been in the USA illegally or overstayed or violated visa conditions?');

    sectionTitle('17. Miscellaneous');
    yesNo('17.1. Have you ever held a US citizen child outside the USA when US court entrusted guardianship to another?');
    yesNo('17.2. Have you voted in the USA in violation of laws?');
    yesNo('17.3. Have you ever renounced US citizenship to avoid taxation?');
    yesNo('17.4. Were you after 30 Nov 1996 a student at a US municipal elementary/middle school on F visa without paying tuition?');

    sectionTitle('18. Where you will apply for a US visa');
    fl('18.1. Specify country and city', null);

    sectionTitle('20. Signature and confirmation');
    doc.setFontSize(8);
    doc.text('I confirm that I have read and understood all questions in this questionnaire. All answers I provided are, to the best of my knowledge, true and accurate. I understand that providing false or misleading information may result in final refusal of a US visa or prohibition of entry to the USA.', margin, y, { maxWidth: pageW - 2 * margin });
    y += 14;
    doc.text('I also understand that possession of a visa does not guarantee admission to the United States and I may be denied entry if grounds for this exist.', margin, y, { maxWidth: pageW - 2 * margin });
    y += 10;
    doc.setFontSize(9);
    fl('Applicant\'s full name', (p.last_name || '') + ' ' + (p.first_name || ''));
    fl('Applicant\'s signature', null);
    fl('City, date', null);
  }

  /** UK Visas & Immigration style PDF: colophon on every page, two-column rows, dash for missing, bold answers/sections, last 2 declaration pages. */
  function buildUkTemplatePdf(doc, data) {
    var profile = data.profile || {};
    var uk = data.ukForm || {};
    var p = profile.personal || {};
    var pass = profile.passport || {};
    var contact = profile.contact || {};
    var addr = profile.address || {};
    var emp = profile.employment || {};
    var pageW = 210;
    var margin = 14;
    var valueX = 100;
    var maxW = valueX - margin - 2;
    var lineH = 6;
    var sectionGap = 4;
    var dash = '-';

    var gwf = 'GWF' + (uk.passport_number ? String(uk.passport_number).replace(/\D/g, '').slice(-9) : '055213144');
    if (gwf.length < 12) gwf = 'GWF055213144';

    function val(v) {
      if (v == null) return dash;
      var s = String(v).trim();
      return s === '' ? dash : s;
    }
    function yesNo(v) {
      if (v == null || String(v).trim() === '') return dash;
      var s = String(v).trim().toLowerCase();
      if (s === 'yes' || s === 'да' || s === 'true' || s === '1') return 'Yes';
      if (s === 'no' || s === 'нет' || s === 'false' || s === '0') return 'No';
      return s;
    }
    function maritalLabel(v) {
      if (!v) return dash;
      var map = { single: 'Single', married: 'Married or a civil partner', divorced: 'Divorced', widowed: 'Widowed', civil_partnership: 'Civil partner' };
      return map[String(v).toLowerCase()] || val(v);
    }

    var colophonOpts = data.colophonOpts || {};
    var y = drawUkColophon(doc, gwf, pageW, margin, colophonOpts);

    function checkPage() {
      if (y > 270) {
        doc.addPage();
        y = drawUkColophon(doc, gwf, pageW, margin, colophonOpts);
      }
    }
    function sectionTitle(title) {
      checkPage();
      y += sectionGap;
      doc.setFontSize(11);
      doc.setFont('helvetica', 'bold');
      doc.text(title, margin, y);
      doc.setFont('helvetica', 'normal');
      y += lineH + 2;
    }
    function row(label, value, valueStr) {
      checkPage();
      var display = valueStr != null ? valueStr : val(value);
      doc.setFontSize(10);
      doc.setFont('helvetica', 'normal');
      var lines = doc.splitTextToSize(label, maxW);
      doc.text(lines, margin, y);
      var labelH = lines.length * lineH;
      var valueLines = doc.splitTextToSize(display, pageW - valueX - margin);
      doc.setFont('helvetica', 'bold');
      doc.text(valueLines, valueX, y);
      doc.setFont('helvetica', 'normal');
      var valueH = valueLines.length * lineH;
      y += Math.max(labelH, valueH) + 2;
      doc.line(margin, y, pageW - margin, y);
      y += 4;
    }

    // Applicant / Personal information
    sectionTitle('Personal information');
    row('Given names', p.first_name);
    row('Family name', p.last_name);
    row('Date of birth', p.birth_date);
    row('Place of birth', p.birth_place);
    row('Country of nationality', p.nationality || profile.citizenship);
    row('Gender', p.gender);
    row('What is your relationship status?', uk.marital_status, maritalLabel(uk.marital_status));
    row('Spouse / partner name (if applicable)', uk.spouse_name);

    sectionTitle('Contact details');
    row('Email address', uk.contact_email || contact.email);
    row('Provide your telephone number', uk.contact_phone || contact.phone);

    sectionTitle('Passport details');
    row('Passport number or travel document reference number', uk.passport_number || pass.number);
    row('Issuing authority', pass.issuing_authority);
    row('Issue date', uk.passport_issued_at || pass.issued_at);
    row('Expiry date', uk.passport_expires_at || pass.expires_at);

    sectionTitle('Address');
    row('Address', uk.address || addr.line || (addr.street ? [addr.street, addr.city, addr.postal_code, addr.country].filter(Boolean).join(', ') : null));

    sectionTitle('Employment');
    row('What is your employment status?', emp.status);
    row('Employer\'s name', uk.work_employer_1 || emp.employer_name);
    row('Your job title', uk.work_position_1 || emp.position);
    row('Date you started working for this employer', uk.work_from_1);
    row('Date you left (if applicable)', uk.work_to_1);
    row('How much do you earn each month - after tax?', uk.income_monthly ? uk.income_monthly + ' ' + (uk.income_currency || 'RUB') : (emp.income_amount ? emp.income_amount + ' ' + (emp.income_currency || 'RUB') : null));
    // Additional work entries
    var workIdx = 2;
    while (uk['work_employer_' + workIdx] || uk['work_position_' + workIdx]) {
      row('Previous employment - Employer', uk['work_employer_' + workIdx]);
      row('Previous employment - Job title', uk['work_position_' + workIdx]);
      row('Previous employment - From', uk['work_from_' + workIdx]);
      row('Previous employment - To', uk['work_to_' + workIdx]);
      workIdx++;
    }

    sectionTitle('Income and expenditure');
    row('How much do you earn each month - after tax?', uk.income_monthly ? uk.income_monthly + ' RUB' : null);
    row('What is the total amount of money you spend each month?', uk.expenses_monthly ? uk.expenses_monthly + ' RUB' : null);
    row('Sources of funds', uk.sources_of_funds);

    sectionTitle('Travel history');
    row('Have you been to the UK in the past 10 years?', uk.had_visas, yesNo(uk.had_visas) === 'Yes' ? 'Yes' : yesNo(uk.had_visas) === 'No' ? 'No' : dash);
    var travelIdx = 1;
    while (uk['travel_country_' + travelIdx] || uk['travel_purpose_' + travelIdx] || uk['travel_from_' + travelIdx]) {
      row('Which country did you visit? (' + travelIdx + ')', uk['travel_country_' + travelIdx]);
      row('What was the reason for your visit? (' + travelIdx + ')', uk['travel_purpose_' + travelIdx]);
      row('Date you arrived (' + travelIdx + ')', uk['travel_from_' + travelIdx]);
      row('Date you left (' + travelIdx + ')', uk['travel_to_' + travelIdx]);
      travelIdx++;
    }

    sectionTitle('Visa refusals and immigration history');
    row('Have you been refused a visa in the past 10 years?', uk.had_refusals, yesNo(uk.had_refusals));
    row('Give details of refusals or immigration problems', uk.visas_refusals_detail);

    sectionTitle('Convictions and other penalties');
    row('Have you ever had a criminal conviction or penalty?', uk.criminal_record, yesNo(uk.criminal_record));
    row('Give more details', uk.criminal_record_detail);

    sectionTitle('Additional information');
    row('Any other information you want to add', uk.additional_info);

    // ——— Last 2 pages: declaration and conditions ———
    doc.addPage();
    y = drawUkColophon(doc, gwf, pageW, margin, colophonOpts);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'normal');
    var decl1 = 'I understand that if false information is given, the application can be refused and I may be prosecuted, and, if I am the applicant, I may be banned from the UK.';
    var decl2 = 'I am the applicant aged 18 or over';
    doc.text(doc.splitTextToSize(decl1, pageW - 2 * margin), margin, y);
    y += doc.splitTextToSize(decl1, pageW - 2 * margin).length * lineH + 8;
    doc.text(decl2, margin, y);
    y += 20;

    doc.addPage();
    y = drawUkColophon(doc, gwf, pageW, margin, colophonOpts);
    doc.setFontSize(10);
    doc.setFont('helvetica', 'bold');
    doc.text('If you stay in the UK without permission:', margin, y);
    y += lineH + 2;
    doc.setFont('helvetica', 'normal');
    var bullets1 = [
      'You can be detained',
      'You can be prosecuted, fined and imprisoned',
      'You can be removed and banned from returning to the UK',
      'You will not be allowed to work',
      'You will not be able to rent a home',
      'You will not be able to claim any benefits and can be prosecuted if you try to',
      'You can be charged by the NHS for medical treatment',
      'You can be denied access to a bank account',
      'DVLA can prevent you from driving by taking away your driving licence'
    ];
    bullets1.forEach(function (b) {
      doc.text('• ' + b, margin + 4, y);
      y += lineH;
    });
    y += 4;
    doc.text('You cannot get free medical treatment from the NHS, unless you are exempt from charges. If you do not pay for any billed treatment this may affect future visa applications.', margin, y, { maxWidth: pageW - 2 * margin });
    y += doc.splitTextToSize('You cannot get free medical treatment from the NHS, unless you are exempt from charges. If you do not pay for any billed treatment this may affect future visa applications.', pageW - 2 * margin).length * lineH + 3;
    doc.text('You or your family members are not entitled to receive state-funded education whilst in the UK (except for children of academics visiting the UK for 12 months).', margin, y, { maxWidth: pageW - 2 * margin });
    y += doc.splitTextToSize('You or your family members are not entitled to receive state-funded education whilst in the UK (except for children of academics visiting the UK for 12 months).', pageW - 2 * margin).length * lineH + 3;
    doc.text('You should leave the UK when your visa ends. If not, you may be removed and banned from the UK.', margin, y, { maxWidth: pageW - 2 * margin });
    y += doc.splitTextToSize('You should leave the UK when your visa ends. If not, you may be removed and banned from the UK.', pageW - 2 * margin).length * lineH + 10;

    doc.line(margin, y, pageW - margin, y);
    y += 8;
    doc.setFont('helvetica', 'bold');
    doc.text('Declaration', margin, y);
    y += lineH + 4;
    doc.setFont('helvetica', 'normal');
    doc.text('By sending this application, you confirm that to the best of your knowledge and belief the following is correct:', margin, y, { maxWidth: pageW - 2 * margin });
    y += lineH * 2 + 2;
    doc.text('• the information relating to the application', margin + 4, y);
    y += lineH;
    doc.text('• the supporting evidence', margin + 4, y);
    y += lineH + 4;
    doc.text('I understand that the data I have given can be used as set out in the privacy policy.', margin, y, { maxWidth: pageW - 2 * margin });
    y += lineH * 2 + 2;
    doc.text('I consent to organisations, including financial institutions, providing information to the Home Office when requested in relation to this application.', margin, y, { maxWidth: pageW - 2 * margin });
    y += lineH * 3 + 2;
    doc.text('I understand that any passports/travel documents submitted in support of my application, which remain uncollected after 3 months from the date they were ready for collection, will be returned to an office of the authority that issued the document.', margin, y, { maxWidth: pageW - 2 * margin });
    y += lineH * 4 + 2;
    doc.text('I have discussed with any other applicants that I am acting on behalf of, and confirmed that the contents of the application are correct and complete.', margin, y, { maxWidth: pageW - 2 * margin });
    y += lineH * 2 + 2;
    doc.text('I agree to the terms and conditions.', margin, y);
  }

  var downloadBtn = document.getElementById('export-download-filled');
  if (downloadBtn) {
    downloadBtn.addEventListener('click', function (e) {
    e.preventDefault();
    if (typeof window.jspdf === 'undefined') {
      alert('Загрузка библиотеки PDF не завершена. Обновите страницу и попробуйте снова.');
      return;
    }
    var data = getExportDataForPdf();
    var profile = data.profile;
    var jsPDF = window.jspdf.jsPDF;
    var doc = new jsPDF();
    var filename = 'visa-' + country + '-' + (profile.personal && profile.personal.last_name ? String(profile.personal.last_name).replace(/\s+/g, '-') : 'application') + '.pdf';

    function doSave() {
      try {
        doc.save(filename);
      } catch (err) {
        console.warn('PDF save failed', err);
        alert('Не удалось сохранить PDF. Проверьте консоль браузера (F12).');
      }
    }

    if (country === 'uk') {
      var uk = data.ukForm || {};
      var gwf = 'GWF' + (uk.passport_number ? String(uk.passport_number).replace(/\D/g, '').slice(-9) : '055213144');
      if (gwf.length < 12) gwf = 'GWF055213144';
      data.colophonOpts = { barcodeDataUrl: getUkBarcodeDataUrl(gwf), crestDataUrl: null };
      getUkCrestDataUrl(function (crestDataUrl) {
        data.colophonOpts.crestDataUrl = crestDataUrl;
        buildUkTemplatePdf(doc, data);
        doSave();
      });
    } else if (country === 'schengen') {
      var refNum = 'SCH-' + (data.profile && data.profile.passport && data.profile.passport.number ? String(data.profile.passport.number).replace(/\D/g, '').slice(-8) : Date.now().toString(36).toUpperCase());
      data.schengenColophonOpts = { refNumber: refNum, barcodeDataUrl: getUkBarcodeDataUrl(refNum) };
      buildSchengenTemplatePdf(doc, data);
      doSave();
    } else if (country === 'japan') {
      buildJapanTemplatePdf(doc, data);
      doSave();
    } else if (country === 'usa') {
      data.usaColophonOpts = data.usaColophonOpts || {};
      getUsaSealDataUrl(function (sealDataUrl, sealW, sealH) {
        data.usaColophonOpts.sealDataUrl = sealDataUrl;
        data.usaColophonOpts.sealImgW = sealW || 0;
        data.usaColophonOpts.sealImgH = sealH || 0;
        buildUsaTemplatePdf(doc, data);
        doSave();
      });
    } else {
      doc.setFontSize(18);
      doc.text('Visa Application', 14, 20);
      doc.setFontSize(11);
      doc.text((COUNTRY_NAMES[country] || country) + ', ' + (VISA_NAMES[visaType] || visaType), 14, 28);
      doc.setFontSize(10);
      var y = 36;
      var line = function (label, value) {
        if (value == null || String(value).trim() === '') return;
        var s = label + ': ' + String(value).trim().substring(0, 88);
        if (s.length > 88) s = s.substring(0, 85) + '...';
        doc.text(s, 14, y);
        y += 6;
      };
      var p = profile.personal || {}, pass = profile.passport || {}, contact = profile.contact || {}, addr = profile.address || {}, emp = profile.employment || {};
      var labels = { surname: 'Surname', first_name: 'First name', birth_date: 'Date of birth', birth_place: 'Place of birth', passport_number: 'Passport number', passport_issued_at: 'Date of issue', passport_expires_at: 'Expiry date', email: 'Email', phone: 'Phone', address_line: 'Address', income: 'Income' };
      line(labels.surname, p.last_name);
      line(labels.first_name, p.first_name);
      line(labels.birth_date, p.birth_date);
      line(labels.birth_place, p.birth_place);
      line(labels.passport_number, pass.number);
      line(labels.passport_issued_at, pass.issued_at);
      line(labels.passport_expires_at, pass.expires_at);
      line(labels.email, contact.email);
      line(labels.phone, contact.phone);
      line(labels.address_line, addr.line);
      line(labels.income, emp.income_amount ? emp.income_amount + ' ' + (emp.income_currency || 'RUB') : '');
      doSave();
    }
  });
  }

  function escapeHtml(s) {
    var div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ——— Мотивационное письмо (USA): только для country=usa, привязка к user_id ———
  function loadMotivationLetter() {
    if (!supabase) return;
    supabase.auth.getUser().then(function (r) {
      var user = r.data && r.data.user;
      if (!user) return;
      supabase.from('motivation_letters').select('*').eq('user_id', user.id).eq('country', 'usa').order('updated_at', { ascending: false }).limit(1).maybeSingle()
        .then(function (res) {
          if (res.data) {
            var f = document.getElementById('motivation-form');
            if (f) {
              ['purpose', 'ties_to_home', 'trip_plan', 'letter_text'].forEach(function (name) {
                var el = f.elements[name];
                if (el && res.data[name]) el.value = res.data[name];
              });
            }
          }
        });
    });
  }

  document.getElementById('motivation-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var f = e.target;
    var data = {
      country: 'usa',
      purpose: (f.elements.purpose && f.elements.purpose.value) || '',
      ties_to_home: (f.elements.ties_to_home && f.elements.ties_to_home.value) || '',
      trip_plan: (f.elements.trip_plan && f.elements.trip_plan.value) || '',
      letter_text: (f.elements.letter_text && f.elements.letter_text.value) || '',
      updated_at: new Date().toISOString()
    };
    var statusEl = document.getElementById('motivation-status');
    if (supabase) {
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) {
          statusEl.textContent = 'Войдите в аккаунт на главной странице, чтобы сохранять письмо.';
          statusEl.style.display = 'block';
          statusEl.style.color = 'var(--tb-warning)';
          return;
        }
        supabase.from('motivation_letters').upsert({ user_id: user.id, ...data }, { onConflict: 'user_id,country' }).then(function (res) {
          if (res.error) {
            statusEl.textContent = 'Ошибка: ' + (res.error.message || 'не удалось сохранить');
            statusEl.style.color = 'var(--tb-error)';
          } else {
            statusEl.textContent = 'Письмо сохранено.';
            statusEl.style.color = 'var(--tb-success)';
          }
          statusEl.style.display = 'block';
        });
      });
    } else {
      statusEl.textContent = 'Supabase не настроен. Данные не сохранены.';
      statusEl.style.color = 'var(--tb-gray-text)';
      statusEl.style.display = 'block';
    }
  });

  loadMotivationLetter();

  var motivationGenerateBtn = document.getElementById('motivation-generate-ai');
  if (motivationGenerateBtn) {
    motivationGenerateBtn.addEventListener('click', function () {
      var statusEl = document.getElementById('motivation-status');
      if (!getChatApiUrl()) {
        statusEl.textContent = 'Добавьте backend с ИИ: задайте VISA_CHAT_API_URL (см. supabase-config.js или документацию).';
        statusEl.style.color = 'var(--tb-warning)';
        statusEl.style.display = 'block';
        return;
      }
      statusEl.textContent = 'Генерация черновика…';
      statusEl.style.color = 'var(--tb-gray-text)';
      statusEl.style.display = 'block';
      motivationGenerateBtn.disabled = true;
      generateMotivationLetterDraft(function (data, err) {
        motivationGenerateBtn.disabled = false;
        if (err) {
          statusEl.textContent = err;
          statusEl.style.color = 'var(--tb-error)';
        } else if (data && data.letter_text) {
          statusEl.textContent = 'Черновик подставлен. Проверьте и нажмите «Сохранить письмо».';
          statusEl.style.color = 'var(--tb-success)';
        } else {
          statusEl.textContent = 'Ответ сервера не содержит текст письма. Проверьте формат ответа backend (letter_text).';
          statusEl.style.color = 'var(--tb-warning)';
        }
      });
    });
  }

  // ——— Анкета UK: только для country=uk, привязка к user_id ———
  var ukWorkCount = 0;
  var ukTravelCount = 0;

  function addUkWorkRow() {
    var id = ++ukWorkCount;
    var div = document.createElement('div');
    div.className = 'uk-repeat-block';
    div.innerHTML = '<div class="form-row"><div class="form-group"><label class="label">Работодатель</label><input type="text" class="input" name="work_employer_' + id + '"></div><div class="form-group"><label class="label">Должность</label><input type="text" class="input" name="work_position_' + id + '"></div></div><div class="form-row"><div class="form-group"><label class="label">Дата начала</label><input type="date" class="input" name="work_from_' + id + '"></div><div class="form-group"><label class="label">Дата окончания</label><input type="date" class="input" name="work_to_' + id + '"></div></div>';
    document.getElementById('uk-work-list').appendChild(div);
  }

  function addUkTravelRow() {
    var id = ++ukTravelCount;
    var div = document.createElement('div');
    div.className = 'uk-repeat-block';
    div.innerHTML = '<div class="form-row"><div class="form-group"><label class="label">Страна</label><input type="text" class="input" name="travel_country_' + id + '"></div><div class="form-group"><label class="label">Цель</label><input type="text" class="input" name="travel_purpose_' + id + '"></div></div><div class="form-row"><div class="form-group"><label class="label">Дата въезда</label><input type="date" class="input" name="travel_from_' + id + '"></div><div class="form-group"><label class="label">Дата выезда</label><input type="date" class="input" name="travel_to_' + id + '"></div></div>';
    document.getElementById('uk-travel-list').appendChild(div);
  }

  if (country === 'uk') {
    document.getElementById('uk-add-work').addEventListener('click', addUkWorkRow);
    document.getElementById('uk-add-travel').addEventListener('click', addUkTravelRow);
    addUkWorkRow();
    addUkTravelRow();

    document.querySelector('select[name="criminal_record"]').addEventListener('change', function () {
      document.getElementById('uk-criminal-detail-wrap').style.display = this.value === 'yes' ? 'block' : 'none';
    });

    function getUkFormData() {
      var f = document.getElementById('uk-form');
      if (!f) return {};
      var data = {};
      f.querySelectorAll('input, select, textarea').forEach(function (el) {
        var name = el.name;
        if (!name) return;
        var v = el.type === 'number' ? el.value : (el.value || '').trim();
        data[name] = v;
      });
      return data;
    }

    function setUkFormData(data) {
      var f = document.getElementById('uk-form');
      if (!f || !data) return;
      Object.keys(data).forEach(function (name) {
        var el = f.elements[name];
        if (el && data[name] != null) el.value = data[name];
      });
    }

    function loadUkApplication() {
      if (!supabase) return;
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) return;
        supabase.from('applications').select('data').eq('user_id', user.id).eq('country', 'uk').maybeSingle()
          .then(function (res) {
            if (res.data && res.data.data) setUkFormData(res.data.data);
          });
      });
    }

    loadUkApplication();

    document.getElementById('uk-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var data = getUkFormData();
      var statusEl = document.getElementById('uk-form-status');
      if (!supabase) {
        statusEl.textContent = 'Supabase не настроен.';
        statusEl.style.display = 'block';
        statusEl.style.color = 'var(--tb-gray-text)';
        return;
      }
      supabase.auth.getUser().then(function (r) {
        var user = r.data && r.data.user;
        if (!user) {
          statusEl.textContent = 'Войдите в аккаунт на главной странице, чтобы сохранять анкету.';
          statusEl.style.color = 'var(--tb-warning)';
          statusEl.style.display = 'block';
          return;
        }
        supabase.from('applications').upsert({
          user_id: user.id,
          country: 'uk',
          visa_type: visaType,
          data: data,
          updated_at: new Date().toISOString()
        }, { onConflict: 'user_id,country' }).then(function (res) {
          if (res.error) {
            statusEl.textContent = 'Ошибка: ' + (res.error.message || 'не удалось сохранить');
            statusEl.style.color = 'var(--tb-error)';
          } else {
            statusEl.textContent = 'Анкета сохранена. Данные привязаны к вашему аккаунту.';
            statusEl.style.color = 'var(--tb-success)';
          }
          statusEl.style.display = 'block';
        });
      });
    });
  }

  // ——— Чат ———
  var chatMessages = document.getElementById('chat-messages');
  var chatForm = document.getElementById('chat-form');
  var chatInput = document.getElementById('chat-input');

  var CHAT_WELCOME = 'Здравствуйте! Я помощник по подаче визы. Можете спросить что угодно или ввести команду:\n\n' +
    '• /help или /команды — список команд\n' +
    '• /чеклист — что проверить перед подачей\n' +
    '• /экспорт — как экспортировать заявку\n' +
    '• /документы — какие документы нужны\n' +
    '• /шенген, /сша, /англия, /япония — требования по стране\n' +
    '• /фото — требования к фото\n' +
    '• /сроки — сроки рассмотрения\n' +
    '• /отказ — что делать при отказе\n' +
    '• /мотивационное — подсказки по мотивационному письму для США\n' +
    '• Напишите «сгенерируй мотивационное письмо» или нажмите «Сгенерировать черновик с ИИ» в форме (нужен настроенный ИИ-backend)';

  function appendMessage(role, text, isTyping) {
    var div = document.createElement('div');
    div.className = 'chat-msg chat-msg--' + role + (isTyping ? ' chat-msg--typing' : '');
    div.innerHTML = (role === 'assistant' ? '<div class="chat-msg__role">Помощник</div>' : '') +
      '<div class="chat-msg__text">' + escapeHtml(text).replace(/\n/g, '<br>') + '</div>';
    chatMessages.appendChild(div);
    chatMessages.scrollTop = chatMessages.scrollHeight;
    return div;
  }

  function setMessageText(el, text) {
    var textEl = el && el.querySelector('.chat-msg__text');
    if (textEl) textEl.innerHTML = escapeHtml(text).replace(/\n/g, '<br>');
  }

  if (chatMessages.children.length === 0) appendMessage('assistant', CHAT_WELCOME);

  function matchAny(text, list) {
    for (var i = 0; i < list.length; i++) {
      if (text.indexOf(list[i]) !== -1) return true;
    }
    return false;
  }

  function getAssistantReply(lower) {
    var cmd = lower.split(/\s/)[0];
    if (cmd === '/help' || cmd === '/команды' || cmd === '/commands' || lower === 'help' || lower === 'хелп' || lower === 'команды' || matchAny(lower, ['какие команды', 'что умеешь', 'справка'])) return CHAT_WELCOME;
    if (cmd === '/чеклист' || cmd === '/checklist' || matchAny(lower, ['чеклист', 'чек-лист', 'что проверить', 'проверь заявку', 'перед подачей'])) {
      return 'Чек-лист перед подачей:\n\n✓ Паспорт действителен не менее 3 месяцев после поездки\n✓ Фото по требованиям страны\n✓ Все поля заявки заполнены\n✓ Справка/выписка актуальны\n✓ Бронь и страховка при необходимости.';
    }
    if (cmd === '/экспорт' || cmd === '/export' || matchAny(lower, ['экспорт', 'экспортировать', 'выгрузить'])) {
      return 'На этой странице вы можете сохранить мотивационное письмо для США и задать вопросы в чате. Данные заявки подготовлены на предыдущем шаге.';
    }
    if (cmd === '/документы' || cmd === '/documents' || matchAny(lower, ['документы', 'какие документы'])) {
      return 'Основные документы: загранпаспорт, фото по формату страны, справка с работы или выписка, бронь, страховка (Шенген). Для США — анкета DS-160 и документы на собеседование.';
    }
    if (cmd === '/шенген' || matchAny(lower, ['шенген', 'европа'])) return 'Шенген: паспорт, фото 3,5×4,5 см, справка, выписка, бронь, страховка от 30 000 €. Сроки 5–15 раб. дней.';
    if (cmd === '/сша' || matchAny(lower, ['сша', 'америка', 'usa'])) {
      return 'США: анкета DS-160, фото 5×5 см, загранпаспорт. На собеседовании — подтверждение связей с родиной, финансы, маршрут. Мотивационное письмо можно подготовить в форме выше на этой странице.';
    }
    if (cmd === '/англия' || cmd === '/uk' || matchAny(lower, ['англия', 'uk'])) return 'UK: паспорт, фото по формату gov.uk, справка, выписка за 6 мес., бронь. Сроки — несколько недель.';
    if (cmd === '/япония' || matchAny(lower, ['япония', 'japan'])) return 'Япония: приглашение или путёвка, паспорт, фото 4,5×4,5 см, справка, выписка.';
    if (cmd === '/фото' || matchAny(lower, ['фото', 'требования к фото'])) return 'Шенген: 3,5×4,5 см. США: 5×5 см. UK: по gov.uk. Япония: 4,5×4,5 см. Светлый фон, без очков/головного убора.';
    if (cmd === '/сроки' || matchAny(lower, ['сроки', 'сколько ждать'])) return 'Шенген: 5–15 дней. США: от нескольких дней после собеседования. UK: несколько недель. Япония: от нескольких дней до 2 недель.';
    if (cmd === '/отказ' || matchAny(lower, ['отказ', 'отказали'])) return 'Устраните причину из решения, соберите доп. документы и подайте снова. В Шенгене возможна апелляция.';
    if (cmd === '/мотивационное' || matchAny(lower, ['мотивационное письмо', 'письмо сша', 'cover letter'])) {
      return 'Мотивационное письмо для США: укажите цель поездки, связи с родиной (работа, семья), план поездки. Текст лучше на английском. Форму выше на этой странице можно сохранить в аккаунт.';
    }
    if (matchAny(lower, ['привет', 'здравствуй'])) return 'Здравствуйте! Чем помочь по визе? Введите /help для списка команд.';
    if (matchAny(lower, ['спасибо'])) return 'Пожалуйста! Удачи с подачей.';
    if (matchAny(lower, ['виза', 'подача', 'документы'])) return 'Могу подсказать по документам (/документы), чек-листу (/чеклист), стране: /шенген, /сша, /англия, /япония. Или /мотивационное — для письма в США.';
    return 'Задайте вопрос про документы, сроки или страну. Команды: /help, /документы, /сша, /мотивационное.';
  }

  function getChatApiUrl() {
    return typeof window.VISA_CHAT_API_URL !== 'undefined' ? window.VISA_CHAT_API_URL : '';
  }

  function getChatApiOpts(body) {
    var opts = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    if (typeof window.VISA_CHAT_API_KEY !== 'undefined' && window.VISA_CHAT_API_KEY) opts.headers['Authorization'] = 'Bearer ' + window.VISA_CHAT_API_KEY;
    return opts;
  }

  /** Если в ответе ИИ есть letter_text — подставить в форму мотивационного письма (без персональных данных). */
  function applyLetterTextIfPresent(data) {
    var text = (data && data.letter_text) ? String(data.letter_text).trim() : '';
    if (!text) return;
    var form = document.getElementById('motivation-form');
    var el = form && form.elements && form.elements.letter_text;
    if (el) {
      el.value = text;
      var statusEl = document.getElementById('motivation-status');
      if (statusEl) {
        statusEl.textContent = 'Черновик письма подставлен. Проверьте и сохраните.';
        statusEl.style.color = 'var(--tb-success)';
        statusEl.style.display = 'block';
      }
    }
  }

  /** Запрос к ИИ: сгенерировать черновик мотивационного письма по цели, связям и плану (персональные данные не отправляются). */
  function generateMotivationLetterDraft(done) {
    var apiUrl = getChatApiUrl();
    if (!apiUrl) {
      if (done) done(null, 'Настройте backend с ИИ: задайте VISA_CHAT_API_URL (и при необходимости VISA_CHAT_API_KEY).');
      return;
    }
    var form = document.getElementById('motivation-form');
    var purpose = (form && form.elements.purpose && form.elements.purpose.value) ? form.elements.purpose.value.trim() : '';
    var ties_to_home = (form && form.elements.ties_to_home && form.elements.ties_to_home.value) ? form.elements.ties_to_home.value.trim() : '';
    var trip_plan = (form && form.elements.trip_plan && form.elements.trip_plan.value) ? form.elements.trip_plan.value.trim() : '';
    var body = { action: 'generate_motivation_letter', purpose: purpose, ties_to_home: ties_to_home, trip_plan: trip_plan };
    fetch(apiUrl, getChatApiOpts(body))
      .then(function (r) { return r.json(); })
      .then(function (data) {
        applyLetterTextIfPresent(data);
        if (done) done(data, null);
      })
      .catch(function (err) {
        if (done) done(null, 'Сервис недоступен.');
      });
  }

  function callLLM(messages, onReply) {
    var apiUrl = getChatApiUrl();
    if (apiUrl) {
      var body = { messages: messages };
      fetch(apiUrl, getChatApiOpts(body)).then(function (r) { return r.json(); })
        .then(function (data) {
          applyLetterTextIfPresent(data);
          onReply((data.reply || data.text || data.message || '').trim() || 'Нет ответа.');
        })
        .catch(function () { onReply('Сервис недоступен.'); });
      return;
    }
    var userLast = (messages.filter(function (m) { return m.role === 'user'; }).pop() || {}).content || '';
    var lower = userLast.toLowerCase().replace(/\s+/g, ' ');
    if (matchAny(lower, ['сгенерируй письмо', 'сгенерировать письмо', 'напиши мотивационное', 'сгенерируй мотивационное', 'generate letter', 'generate motivation'])) {
      if (country === 'usa') {
        generateMotivationLetterDraft(function (data, err) {
          if (err) onReply(err);
          else if (data && data.letter_text) onReply('Черновик письма подставлен в форму выше. Проверьте и сохраните.');
          else onReply('Черновик можно сгенерировать после настройки backend с ИИ (VISA_CHAT_API_URL). Заполните цель, связи и план и нажмите «Сгенерировать черновик с ИИ».');
        });
        return;
      }
    }
    var reply = getAssistantReply(lower);
    setTimeout(function () { onReply(reply); }, 400 + Math.random() * 200);
  }

  chatForm.addEventListener('submit', function (e) {
    e.preventDefault();
    var text = (chatInput.value || '').trim();
    if (!text) return;
    chatInput.value = '';
    appendMessage('user', text);
    var typingEl = appendMessage('assistant', '…', true);
    var history = [];
    chatMessages.querySelectorAll('.chat-msg__text').forEach(function (el) {
      var msg = el.closest('.chat-msg');
      if (!msg || msg.classList.contains('chat-msg--typing')) return;
      var role = msg.classList.contains('chat-msg--user') ? 'user' : 'assistant';
      history.push({ role: role, content: el.textContent });
    });
    callLLM(history, function (reply) {
      typingEl.classList.remove('chat-msg--typing');
      setMessageText(typingEl, reply);
      chatMessages.scrollTop = chatMessages.scrollHeight;
    });
  });
})();
