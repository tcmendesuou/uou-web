// src/pages/Landing.jsx
// Página pública do uoulive.com (quem não está logado): lista de espera + entrada para quem já tem conta.
// Cadastro de e-mails: coleção `waitlist` do Firestore (doc id = e-mail).
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { doc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import bg from '../assets/landing-bg.jpg';

const CODES = ('AF AL DZ AD AO AG AR AM AU AT AZ BS BH BD BB BY BE BZ BJ BT BO BA BW BN BG BF BI CV KH CM CA CF TD CL CN CO KM CG CD CR CI HR CU CY CZ DK DJ DM DO EC EG SV GQ ER EE SZ ET FJ FI FR GA GM GE DE GH GR GD GT GN GW GY HT HN HK HU IS IN ID IR IQ IE IL IT JM JP JO KZ KE KI KW KG LA LV LB LS LR LY LI LT LU MO MG MW MY MV ML MT MH MR MU MX FM MD MC MN ME MA MZ MM NA NR NP NL NZ NI NE NG KP MK NO OM PK PW PS PA PG PY PE PH PL PT PR QA RO RU RW KN LC VC WS SM ST SA SN RS SC SL SG SK SI SB SO ZA KR SS ES LK SD SR SE CH SY TW TJ TZ TH TL TG TO TT TN TR TM TV UG UA AE GB US UY UZ VU VA VE VN YE ZM ZW').split(' ');

function countryList() {
  let names = [];
  try {
    const dn = new Intl.DisplayNames(['en'], { type: 'region' });
    CODES.forEach((c) => { const n = dn.of(c); if (n && n !== c) names.push(n); });
  } catch (e) { names = []; }
  names.sort((a, b) => a.localeCompare(b, 'en'));
  const list = names.length ? ['Brazil', ...names.filter((n) => n !== 'Brazil')] : ['Brazil', 'United States', 'Portugal', 'Spain', 'United Kingdom'];
  list.push('Other');
  return list;
}

const CSS = `
.lp-root{--green:#3dff3d;--ink:#010208;--panel:rgba(3,10,24,.90);--line:rgba(80,130,255,.55);--text:#eaf2ff;--muted:#b9c7e6;
  position:relative;min-height:100vh;display:flex;align-items:center;font-family:'Plus Jakarta Sans',-apple-system,'Segoe UI',Roboto,sans-serif;color:var(--text);background:var(--ink);box-sizing:border-box}
.lp-root *{box-sizing:border-box}
.lp-bg{position:fixed;inset:0;z-index:0;background:var(--ink) url(${bg}) no-repeat right center / cover}
.lp-shade{position:fixed;inset:0;z-index:1;pointer-events:none;background:linear-gradient(90deg,rgba(1,2,8,.55) 0%,rgba(1,2,8,.15) 55%,rgba(1,2,8,0) 100%)}
.lp-wrap{position:relative;z-index:2;width:100%;padding:4vh 3.4vw}
.lp-hero{display:none}
.lp-login{position:fixed;top:18px;right:22px;z-index:3;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:999px;border:1px solid #52fa35;background:rgba(82,250,53,.1);color:#52fa35;font:inherit;font-size:14px;font-weight:700;text-decoration:none;backdrop-filter:blur(8px)}
.lp-login:hover{background:rgba(82,250,53,.18)}
.lp-panel{width:min(50vw,700px);min-width:460px;padding:clamp(28px,3.6vw,52px);border-radius:28px;background:var(--panel);-webkit-backdrop-filter:blur(18px);backdrop-filter:blur(18px);border:1px solid rgba(90,150,255,.45);box-shadow:0 0 0 1px rgba(61,255,61,.10) inset,0 0 42px rgba(40,120,255,.30),0 0 90px rgba(61,255,61,.10)}
.lp-panel h1{margin:0 0 18px;font-size:clamp(40px,min(5.6vw,9vh),84px);line-height:.98;font-weight:800;letter-spacing:-.02em}
.lp-l1{display:block;background:linear-gradient(180deg,#fff 30%,#cfd9ff);-webkit-background-clip:text;background-clip:text;color:transparent}
.lp-l2{display:block;background:linear-gradient(180deg,#e8ffe8 0%,#3dff3d 70%);-webkit-background-clip:text;background-clip:text;color:transparent;filter:drop-shadow(0 0 18px rgba(61,255,61,.35))}
.lp-lead{margin:0 0 26px;font-size:clamp(15px,1.35vw,20px);line-height:1.45;color:var(--muted);max-width:34em}
.lp-lead b{color:#fff;font-weight:700}
.lp-form{display:grid;gap:14px}
.lp-field{position:relative;display:flex;align-items:center;border-radius:14px;border:1px solid var(--line);background:rgba(8,20,48,.65);transition:border-color .2s,box-shadow .2s}
.lp-field:focus-within{border-color:var(--green);box-shadow:0 0 0 3px rgba(61,255,61,.18),0 0 22px rgba(61,255,61,.25)}
.lp-field svg.ico{flex:0 0 auto;width:22px;height:22px;margin:0 14px 0 18px;stroke:#cfe0ff;fill:none;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round}
.lp-field input,.lp-field select{flex:1;min-width:0;height:58px;padding:0 18px 0 0;background:transparent;border:0;outline:0;color:#fff;font:inherit;font-size:16px}
.lp-field input::placeholder{color:#aebbdc;opacity:1}
.lp-field select{appearance:none;-webkit-appearance:none;cursor:pointer;padding-right:48px}
.lp-field select.empty{color:#aebbdc}
.lp-field select option{color:#0a1228;background:#fff}
.lp-chev{position:absolute;right:18px;top:50%;width:20px;height:20px;margin-top:-10px;stroke:#cfe0ff;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;pointer-events:none}
.lp-cta{margin-top:6px;height:62px;border:0;border-radius:999px;background:linear-gradient(180deg,#5bff4a,#2fe83a);color:#031208;font:inherit;font-size:18px;font-weight:700;display:inline-flex;align-items:center;justify-content:center;gap:12px;cursor:pointer;box-shadow:0 0 28px rgba(61,255,61,.45);transition:transform .15s,box-shadow .15s,filter .15s}
.lp-cta:hover{transform:translateY(-1px);box-shadow:0 0 40px rgba(61,255,61,.65)}
.lp-cta:disabled{filter:grayscale(.4) brightness(.8);cursor:progress;transform:none}
.lp-cta svg{width:22px;height:22px;stroke:#031208;fill:none;stroke-width:2.2;stroke-linecap:round;stroke-linejoin:round}
.lp-msg{min-height:22px;margin:2px 2px 0;font-size:14px;color:#ff8e8e}
.lp-divider{display:flex;align-items:center;gap:12px;margin:18px 0 16px}
.lp-divider::before,.lp-divider::after{content:'';flex:1;height:1px;background:rgba(255,255,255,.14)}
.lp-divider i{width:5px;height:5px;border-radius:50%;background:var(--green);box-shadow:0 0 8px var(--green)}
.lp-thanks{display:flex;gap:14px;align-items:flex-start;font-size:14px;line-height:1.5;color:var(--muted)}
.lp-badge{flex:0 0 auto;width:46px;height:46px;border-radius:50%;border:1.5px solid var(--green);display:grid;place-items:center;box-shadow:0 0 14px rgba(61,255,61,.35)}
.lp-badge svg{width:22px;height:22px;stroke:var(--green);fill:none;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}
.lp-fine{margin:14px 0 0;font-size:12px;color:#8497c2}
.lp-success h2{margin:0 0 12px;font-size:clamp(30px,3.4vw,48px);font-weight:800;line-height:1.05;background:linear-gradient(180deg,#e8ffe8,#3dff3d);-webkit-background-clip:text;background-clip:text;color:transparent}
.lp-success p{margin:0;font-size:17px;line-height:1.5;color:var(--muted);max-width:30em}
.lp-hp{position:absolute!important;left:-9999px;width:1px;height:1px;overflow:hidden}
@media (min-width:701px) and (max-height:820px){
  .lp-panel{padding:28px 34px}.lp-lead{margin-bottom:18px}.lp-field input,.lp-field select{height:52px}.lp-cta{height:56px}.lp-divider{margin:12px 0}.lp-thanks{font-size:13px}
}
@media (max-width:700px){
  .lp-root{display:block}
  .lp-bg{background-position:78% center}
  .lp-shade{background:linear-gradient(180deg,rgba(1,2,8,.35),rgba(1,2,8,.75))}
  .lp-wrap{padding:0 16px 28px}
  .lp-hero{display:block;margin:0 -16px;height:84vw;background:url(${bg}) no-repeat 83% 0 / 300% auto}
  .lp-login{top:12px;right:12px;padding:8px 14px;font-size:13px}
  .lp-panel{width:100%;min-width:0;padding:26px 20px 24px;border-radius:24px;background:rgba(3,10,24,.97)}
  .lp-panel h1{font-size:clamp(40px,11vw,64px)}
  .lp-field input,.lp-field select{height:54px}
  .lp-cta{height:58px}
}
`;

export default function Landing() {
  const countries = useMemo(countryList, []);
  const [form, setForm] = useState({ name: '', email: '', country: '', website: '' });
  const [msg, setMsg] = useState('');
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);
  const titleRef = useRef(document.title);

  useEffect(() => {
    const prev = titleRef.current;
    document.title = 'UOU – Join the Waitlist';
    return () => { document.title = prev; };
  }, []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setMsg('');
    const name = form.name.trim().replace(/\s+/g, ' ');
    const email = form.email.trim().toLowerCase();
    if (form.website.trim()) { setDone(true); return; } // robô: finge sucesso
    if (name.length < 2) return setMsg('Please enter your full name.');
    if (!/^[^\s@/]+@[^\s@/]+\.[^\s@/]{2,}$/.test(email) || email.length > 254) return setMsg('Please enter a valid email.');
    if (!form.country) return setMsg('Please choose your country.');
    setSending(true);
    try {
      await setDoc(doc(db, 'waitlist', email), {
        name, email, country: form.country, createdAt: new Date().toISOString(), source: 'uoulive.com',
      });
      setDone(true);
    } catch (err) {
      // e-mail que já está na lista é bloqueado pela regra: para a pessoa é sucesso do mesmo jeito
      if (err?.code === 'permission-denied') setDone(true);
      else { console.error('[Landing] waitlist:', err); setMsg('Something went wrong. Please try again in a moment.'); }
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="lp-root">
      <style>{CSS}</style>
      <div className="lp-bg" />
      <div className="lp-shade" />
      <Link to="/login" className="lp-login">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><path d="m10 17 5-5-5-5" /><path d="M15 12H3" /></svg>
        Member login
      </Link>
      <main className="lp-wrap">
        <div className="lp-hero" role="img" aria-label="UOU and UOU PAY" />
        <section className="lp-panel" aria-labelledby="lp-title">
          {!done ? (
            <>
              <h1 id="lp-title"><span className="lp-l1">Join the</span><span className="lp-l2">Waitlist</span></h1>
              <p className="lp-lead">Be among the first to discover what <b>UOU</b> and <b>UOU PAY</b> are preparing for the future.</p>

              <form className="lp-form" onSubmit={submit} noValidate>
                <label className="lp-field">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4.4 3.6-7 8-7s8 2.6 8 7" /></svg>
                  <input type="text" placeholder="Full Name" autoComplete="name" maxLength={100} aria-label="Full Name" value={form.name} onChange={set('name')} />
                </label>
                <label className="lp-field">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 7 8.5-7" /></svg>
                  <input type="email" placeholder="Email" autoComplete="email" maxLength={254} aria-label="Email" value={form.email} onChange={set('email')} />
                </label>
                <label className="lp-field">
                  <svg className="ico" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 21s7-5.6 7-11a7 7 0 1 0-14 0c0 5.4 7 11 7 11z" /><circle cx="12" cy="10" r="2.6" /></svg>
                  <select className={form.country ? '' : 'empty'} aria-label="Country of Origin" value={form.country} onChange={set('country')}>
                    <option value="" disabled>Country of Origin</option>
                    {countries.map((n) => <option key={n} value={n}>{n}</option>)}
                  </select>
                  <svg className="lp-chev" viewBox="0 0 24 24" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
                </label>

                <div className="lp-hp" aria-hidden="true">
                  <label>Website <input type="text" tabIndex={-1} autoComplete="off" value={form.website} onChange={set('website')} /></label>
                </div>

                <button className="lp-cta" type="submit" disabled={sending}>
                  <span>{sending ? 'Sending...' : 'Join the Waitlist'}</span>
                  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
                </button>
                <p className="lp-msg" role="status" aria-live="polite">{msg}</p>
              </form>
            </>
          ) : (
            <div className="lp-success" role="status" aria-live="polite">
              <h2>You're on the list.</h2>
              <p>Thank you for joining. We'll reach out with news about UOU and UOU PAY as soon as there is something to share.</p>
            </div>
          )}

          <div className="lp-divider" aria-hidden="true"><i /></div>

          <div className="lp-thanks">
            <span className="lp-badge" aria-hidden="true">
              <svg viewBox="0 0 24 24"><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3.5 6.5 8.5 7 8.5-7" /></svg>
            </span>
            <span>Thank you for your interest in UOU. We are building something designed to connect people, creators and new possibilities. Your journey with us is just beginning.</span>
          </div>

          {!done && <p className="lp-fine">By joining, you agree to receive occasional updates about UOU and UOU PAY. You can ask us to remove your email at any time.</p>}
        </section>
      </main>
    </div>
  );
}
