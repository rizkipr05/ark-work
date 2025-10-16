export function trialStartedTemplate(company: string, plan: string, endISO: string) {
  const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
  return {
    subject: `Trial ${plan} aktif hingga ${end}`,
    html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Trial paket <b>${plan}</b> Anda sudah aktif.</p>
      <p>Masa trial berakhir pada <b>${end}</b>. Silakan upgrade sebelum berakhir untuk tetap menikmati fitur premium.</p>
      <p>Terima kasih,<br/>Tim ArkWork</p>
    `
  };
}

export function paymentSuccessTemplate(company: string, plan: string, endISO: string) {
  const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
  return {
    subject: `Pembayaran berhasil — ${plan} aktif sampai ${end}`,
    html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Pembayaran berhasil. Paket <b>${plan}</b> sudah aktif.</p>
      <p>Periode Anda berlaku sampai <b>${end}</b>.</p>
      <p>Terima kasih telah berlangganan ArkWork!</p>
    `
  };
}

export function renewalSuccessTemplate(company: string, plan: string, endISO: string) {
  const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
  return {
    subject: `Langganan diperpanjang — aktif sampai ${end}`,
    html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Perpanjangan paket <b>${plan}</b> berhasil. Berlaku sampai <b>${end}</b>.</p>
      <p>Terima kasih!</p>
    `
  };
}

export function willExpireTemplate(company: string, leftDays: number, endISO: string) {
  const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
  return {
    subject: `Pengingat: ${leftDays} hari lagi langganan berakhir`,
    html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Langganan Anda akan berakhir dalam <b>${leftDays} hari</b> (tanggal <b>${end}</b>).</p>
      <p>Silakan perpanjang untuk menghindari penghentian fitur premium.</p>
    `
  };
}

export function expiredTemplate(company: string, endedISO: string) {
  const ended = new Date(endedISO).toLocaleString('id-ID', { dateStyle: 'medium' });
  return {
    subject: `Langganan berakhir (${ended})`,
    html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Langganan Anda telah berakhir pada <b>${ended}</b>. Anda masih bisa memperpanjang kapan saja untuk kembali ke fitur premium.</p>
      <p>Terima kasih.</p>
    `
  };
}
