import React, { useMemo, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { Download, MessageCircle, ReceiptText, ShieldCheck, Smartphone, QrCode, ExternalLink, Search, Users, Eye, X, FileText, Trash2 } from 'lucide-react';
import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';
import './styles.css';

const TEAM = {
  nameKannada: 'ಪವರ್ ಸ್ಟಾರ್ ಗೆಳೆಯರ ಬಳಗ',
  nameEnglish: 'Power Star Geleyara Balaga',
  code: 'PSGB',
  festival: 'Ganesh Chaturthi Collection',
  upiId: '9591162652@ybl',
  upiName: 'Power Star Geleyara Balaga',
};

const initialForm = {
  devoteeName: '',
  amount: '',
  phone: '',
  paymentMode: 'Cash',
};

function getReceipts() {
  try {
    return JSON.parse(localStorage.getItem('psgb_receipts') || '[]');
  } catch {
    return [];
  }
}

function getNextReceiptNumber() {
  const receipts = getReceipts();
  const maxFromSaved = receipts.reduce((max, item) => {
    const match = String(item.receiptNo || '').match(/-(\d{4})$/);
    return Math.max(max, match ? Number(match[1]) : 0);
  }, 0);
  const legacyCounter = Number(localStorage.getItem('psgb_receipt_counter') || '0');
  const current = Math.max(maxFromSaved, legacyCounter) + 1;
  localStorage.setItem('psgb_receipt_counter', String(current));
  return `${TEAM.code}-${new Date().getFullYear()}-${String(current).padStart(4, '0')}`;
}

function formatMoney(value) {
  const number = Number(value || 0);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(number);
}

function formatDateTime(date) {
  return {
    date: date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
    time: date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true }),
  };
}

function buildUpiUri(amount) {
  const params = new URLSearchParams({ pa: TEAM.upiId, pn: TEAM.upiName, cu: 'INR' });
  if (Number(amount) > 0) params.set('am', Number(amount).toFixed(2));
  return `upi://pay?${params.toString()}`;
}

function getQrUrl(value) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=260x260&margin=12&data=${encodeURIComponent(value)}`;
}

function sanitizeFileName(value) {
  return String(value || 'receipt').replace(/[^a-z0-9-_]/gi, '_');
}

function App() {
  const [form, setForm] = useState(initialForm);
  const [receipt, setReceipt] = useState(null);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [selectedDonor, setSelectedDonor] = useState(null);
  const [lastShared, setLastShared] = useState(false);

  const receipts = getReceipts();
  const filteredReceipts = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return receipts;
    return receipts.filter((item) =>
      [item.receiptNo, item.devoteeName, item.phone, item.paymentMode, item.date]
        .some((value) => String(value || '').toLowerCase().includes(q))
    );
  }, [search, receipt]);

  function updateField(key, value) {
    setForm((old) => ({ ...old, [key]: value }));
  }

  function generateReceipt(event) {
    event.preventDefault();
    setError('');
    const amount = Number(form.amount);
    if (!form.devoteeName.trim()) return setError('Please enter the devotee name.');
    if (!amount || amount <= 0) return setError('Please enter a valid amount.');
    if (!/^[0-9]{10}$/.test(form.phone.replace(/\D/g, ''))) {
      return setError('Please enter the donor\'s 10-digit mobile number.');
    }

    const now = new Date();
    const { date, time } = formatDateTime(now);
    const next = {
      ...form,
      phone: form.phone.replace(/\D/g, ''),
      amount,
      receiptNo: getNextReceiptNumber(),
      date,
      time,
      createdAt: now.toISOString(),
    };
    const saved = getReceipts();
    localStorage.setItem('psgb_receipts', JSON.stringify([next, ...saved]));
    setReceipt(next);
    setSelectedDonor(next);
    setLastShared(false);
  }

  async function buildPdfBlob(receiptData) {
    const node = document.getElementById('receipt-card');
    if (!node || !receiptData) throw new Error('Receipt preview is not available.');
    const canvas = await html2canvas(node, { scale: 2, backgroundColor: '#fffdf8', useCORS: true });
    const image = canvas.toDataURL('image/png');
    const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' });
    const pageWidth = pdf.internal.pageSize.getWidth();
    const pageHeight = pdf.internal.pageSize.getHeight();
    const margin = 15;
    const width = pageWidth - margin * 2;
    const height = (canvas.height * width) / canvas.width;
    const renderHeight = Math.min(height, pageHeight - margin * 2);
    pdf.addImage(image, 'PNG', margin, margin, width, renderHeight);
    return pdf.output('blob');
  }

  async function downloadPdf(receiptData = receipt) {
    if (!receiptData) return;
    setError('');
    try {
      const blob = await buildPdfBlob(receiptData);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `${sanitizeFileName(receiptData.receiptNo)}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(`Could not create PDF: ${err.message}`);
    }
  }

  // Shares the actual PDF file through the phone's share sheet (pick WhatsApp,
  // then the donor). This is the only way to send the real PDF file.
  async function sharePdfFile(receiptData = receipt) {
    if (!receiptData) return;
    setError('');
    setLastShared(false);
    try {
      const blob = await buildPdfBlob(receiptData);
      const file = new File([blob], `${sanitizeFileName(receiptData.receiptNo)}.pdf`, { type: 'application/pdf' });
      const shareText = `🙏 Ganesh Chaturthi Collection Receipt\n${TEAM.nameEnglish}\nReceipt No: ${receiptData.receiptNo}\nDevotee: ${receiptData.devoteeName}\nAmount: ${formatMoney(receiptData.amount)}`;
      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({ title: `${TEAM.nameEnglish} - Receipt`, text: shareText, files: [file] });
        setLastShared(true);
        return;
      }
      // Desktop / unsupported browsers: fall back to downloading the PDF file.
      await downloadPdf(receiptData);
      setError('This browser cannot attach files to WhatsApp. The PDF was downloaded — attach it in WhatsApp, or use a phone to share it directly.');
    } catch (err) {
      if (err?.name === 'AbortError') return;
      setError(`Could not share the PDF: ${err.message}`);
    }
  }

  // Opens WhatsApp directly to the donor's number (typed at the top) with the
  // full receipt prefilled as a message — the operator just taps Send.
  // Note: WhatsApp does not allow a link to auto-attach a file, so the receipt
  // is sent as text. Use "Download PDF" when the PDF file itself is needed.
  function sendReceiptOnWhatsApp(receiptData = receipt) {
    if (!receiptData) return;
    setError('');
    setLastShared(false);
    const phone = String(receiptData.phone || '').replace(/\D/g, '');
    if (phone.length !== 10) {
      setError("Please enter the donor's 10-digit WhatsApp number before sending.");
      return;
    }
    const text = [
      '🙏 Ganesh Chaturthi Collection Receipt',
      '',
      TEAM.nameKannada,
      TEAM.nameEnglish,
      '',
      `Receipt No: ${receiptData.receiptNo}`,
      `Date: ${receiptData.date}  ${receiptData.time}`,
      `Devotee Name: ${receiptData.devoteeName}`,
      `Amount: ${formatMoney(receiptData.amount)}`,
      `Payment Mode: ${receiptData.paymentMode}`,
      '',
      'Thank you for your valuable contribution. 🙏',
    ].join('\n');
    const waUrl = `https://wa.me/91${phone}?text=${encodeURIComponent(text)}`;
    const link = document.createElement('a');
    link.href = waUrl;
    link.target = '_blank';
    link.rel = 'noopener';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setLastShared(true);
  }

  function sendSms(receiptData = receipt) {
    if (!receiptData) return;
    const phone = receiptData.phone.replace(/\D/g, '');
    if (phone.length !== 10) {
      setError('Please enter the donor\'s 10-digit mobile number before sending SMS.');
      return;
    }
    const text = [
      '🙏 Ganesh Chaturthi Collection', '', TEAM.nameKannada, '',
      `Receipt No: ${receiptData.receiptNo}`, `Date: ${receiptData.date}`, `Time: ${receiptData.time}`,
      `Devotee Name: ${receiptData.devoteeName}`, `Amount: ${formatMoney(receiptData.amount)}`,
      `Payment Mode: ${receiptData.paymentMode}`, '', 'Thank you for your valuable contribution. 🙏',
    ].join('\n');
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
    const smsUrl = isIOS ? `sms:+91${phone}&body=${encodeURIComponent(text)}` : `sms:+91${phone}?body=${encodeURIComponent(text)}`;
    const link = document.createElement('a');
    link.href = smsUrl;
    document.body.appendChild(link);
    link.click();
    link.remove();
  }

  function selectDonor(item) {
    setSelectedDonor(item);
    setReceipt(item);
    setError('');
  }

  function deleteDonor(item) {
    const ok = window.confirm(`Delete receipt ${item.receiptNo} for ${item.devoteeName}? This cannot be undone.`);
    if (!ok) return;
    const updated = getReceipts().filter((saved) => saved.receiptNo !== item.receiptNo);
    localStorage.setItem('psgb_receipts', JSON.stringify(updated));
    if (receipt?.receiptNo === item.receiptNo) {
      setReceipt(null);
      setSelectedDonor(null);
    }
    setLastShared(false);
    setError('');
    setSearch((value) => value);
    // Force a render so the donor list refreshes immediately.
    setSelectedDonor((current) => current && current.receiptNo === item.receiptNo ? null : current);
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand-mark">PSGB</div>
        <div><div className="brand-kn">{TEAM.nameKannada}</div><div className="brand-en">{TEAM.nameEnglish}</div></div>
        <div className="top-code">{TEAM.code}</div>
      </header>

      <section className="hero">
        <div>
          <p className="eyebrow">2026 • FESTIVAL COLLECTION</p>
          <h1>Ganesha Festival<br /><span>Collection Portal</span></h1>
          <p className="hero-copy">Create digital receipts and keep a clear list of everyone who contributed to the festival collection.</p>
        </div>
        <div className="ganesha-placeholder" aria-label="Ganesha artwork placeholder">ॐ<br /><span>श्री गणेशाय नमः</span></div>
      </section>

      {!receipt ? (
        <>
          <section className="panel">
            <div className="panel-heading"><div className="icon-wrap"><ReceiptText size={22} /></div><div><h2>New Receipt</h2><p>Enter the devotee and collection details.</p></div></div>
            <form onSubmit={generateReceipt} className="form-grid">
              <label>Devotee Name<input value={form.devoteeName} onChange={(e) => updateField('devoteeName', e.target.value)} placeholder="Enter devotee name" /></label>
              <label>Amount<input type="number" min="1" value={form.amount} onChange={(e) => updateField('amount', e.target.value)} placeholder="e.g. 5000" /></label>
              <label>WhatsApp Number<input inputMode="numeric" value={form.phone} onChange={(e) => updateField('phone', e.target.value.replace(/\D/g, '').slice(0, 10))} placeholder="10-digit mobile number" /></label>
              <label>Payment Mode<select value={form.paymentMode} onChange={(e) => updateField('paymentMode', e.target.value)}><option>Cash</option><option>UPI</option><option>Online</option><option>Cheque</option></select></label>
              {form.paymentMode === 'UPI' && <div className="upi-box"><div className="upi-copy"><div className="upi-heading"><QrCode size={20} /> UPI Payment</div><p>Scan with Google Pay, PhonePe, Paytm or another UPI app.</p><strong>{TEAM.upiId}</strong>{Number(form.amount) > 0 && <small>Amount: {formatMoney(form.amount)}</small>}<a href={buildUpiUri(form.amount)} className="upi-link">Open UPI app <ExternalLink size={14} /></a></div><img className="upi-qr" src={getQrUrl(buildUpiUri(form.amount))} alt="UPI payment QR code" /></div>}
              {error && !receipt && <p className="error">{error}</p>}
              <button className="primary-btn" type="submit">Generate Receipt</button>
            </form>
          </section>

          <section className="panel donors-panel">
            <div className="panel-heading"><div className="icon-wrap"><Users size={22} /></div><div><h2>Donations & Donors</h2><p>{receipts.length} contribution{receipts.length === 1 ? '' : 's'} recorded on this device.</p></div></div>
            <div className="search-wrap"><Search size={18} /><input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search donor, receipt, phone or payment mode" /></div>
            {filteredReceipts.length === 0 ? <div className="empty-state"><FileText size={30} /><strong>No donations yet</strong><span>Generated receipts will appear here.</span></div> : <div className="donor-list">{filteredReceipts.map((item) => <article className="donor-row" key={item.receiptNo}><div className="donor-main"><div className="donor-avatar">{String(item.devoteeName || '?').trim().charAt(0).toUpperCase()}</div><div><strong>{item.devoteeName}</strong><span>{item.receiptNo} • {item.date}</span></div></div><div className="donor-payment"><strong>{formatMoney(item.amount)}</strong><span>{item.paymentMode}</span></div><div className="donor-actions"><button onClick={() => selectDonor(item)} title="View receipt"><Eye size={17} /> View</button><button onClick={() => downloadPdf(item)} title="Download PDF"><Download size={17} /></button><button className="delete-btn" onClick={() => deleteDonor(item)} title="Delete donation"><Trash2 size={17} /> Delete</button></div></article>)}</div>}
          </section>
        </>
      ) : (
        <section className="result-section">
          <div className="success-banner"><ShieldCheck size={20} /> Receipt ready for {receipt.devoteeName}</div>
          <div className="receipt-card" id="receipt-card">
            <div className="receipt-head"><div className="mini-logo">PSGB</div><div><h2>{TEAM.nameKannada}</h2><p>{TEAM.festival}</p></div></div>
            <div className="receipt-title">COLLECTION RECEIPT</div>
            <div className="receipt-grid"><span>Receipt No.</span><strong>{receipt.receiptNo}</strong><span>Date</span><strong>{receipt.date}</strong><span>Time</span><strong>{receipt.time}</strong><span>Devotee</span><strong>{receipt.devoteeName}</strong><span>Phone</span><strong>{receipt.phone || '—'}</strong><span>Payment Mode</span><strong>{receipt.paymentMode}</strong></div>
            {receipt.paymentMode === 'UPI' && <div className="receipt-upi"><img src={getQrUrl(buildUpiUri(receipt.amount))} alt="UPI payment QR code" /><div><strong>UPI Payment</strong><span>{TEAM.upiId}</span><small>Scan to pay {formatMoney(receipt.amount)}</small></div></div>}
            <div className="amount-box"><small>AMOUNT</small><strong>{formatMoney(receipt.amount)}</strong></div>
            <p className="thank-you">Thank you for your valuable contribution to the Ganesha festival. 🙏</p>
          </div>
          {error && <p className="error result-error">{error}</p>}
          {lastShared && <p className="share-success"><MessageCircle size={18} /> Opened in WhatsApp — pick the donor if asked, then tap Send.</p>}
          <div className="action-row"><button className="whatsapp-btn" onClick={() => sharePdfFile(receipt)}><MessageCircle size={18} /> Send PDF via WhatsApp</button><button className="secondary-btn" onClick={() => sendReceiptOnWhatsApp(receipt)}><MessageCircle size={18} /> Send as text</button><button className="secondary-btn" onClick={() => downloadPdf(receipt)}><Download size={18} /> Download PDF</button><button className="sms-btn" onClick={() => sendSms(receipt)}><Smartphone size={18} /> Send SMS</button></div>
          <button className="new-btn" onClick={() => { setReceipt(null); setSelectedDonor(null); setForm(initialForm); setError(''); setLastShared(false); }}>Create New Receipt</button>
          <button className="back-list-btn" onClick={() => { setReceipt(null); setSelectedDonor(null); setError(''); }}>← Back to Donor List</button>
        </section>
      )}

      {selectedDonor && !receipt && null}

      <footer>© 2026 {TEAM.nameEnglish} • Ganesha Chaturthi Collection</footer>
    </main>
  );
}

createRoot(document.getElementById('root')).render(<App />);
