'use strict';
// Proxy + normalizer for the public Extra Life (DonorDrive) API, cached at the edge so
// many viewers/previews cost one upstream request per ~15s.
const BASE = 'https://www.extra-life.org/api';

async function getJSON(path) {
  const r = await fetch(BASE + path, {
    headers: { Accept: 'application/json', 'User-Agent': 'arcade-overlay' },
  });
  if (!r.ok) {
    const e = new Error('Extra Life API returned ' + r.status);
    e.status = r.status;
    throw e;
  }
  return r.json();
}

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

module.exports = async (req, res) => {
  const q = req.query || {};
  const pid = String(q.pid || '').replace(/\D/g, '').slice(0, 10);
  const tid = String(q.tid || '').replace(/\D/g, '').slice(0, 10);
  if (!pid) return res.status(400).json({ error: 'pid (participant ID) is required' });

  try {
    const [p, dons, miles, team] = await Promise.all([
      getJSON('/participants/' + pid),
      getJSON('/participants/' + pid + '/donations?limit=25').catch(() => []),
      getJSON('/participants/' + pid + '/milestones').catch(() => []),
      tid ? getJSON('/teams/' + tid).catch(() => null) : Promise.resolve(null),
    ]);

    const donations = (Array.isArray(dons) ? dons : [])
      .filter((d) => d && !d.isRegFee && num(d.amount) > 0)
      .map((d) => ({
        id: String(d.donationID || (d.donorID || '') + '|' + (d.createdDateUTC || '')),
        name: d.displayName || 'Anonymous',
        amount: num(d.amount),
        message: d.message || '',
        createdAt: d.createdDateUTC || '',
      }))
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));

    const milestones = (Array.isArray(miles) ? miles : [])
      .map((m) => ({ amount: num(m.fundraisingGoal), label: String(m.description || '').slice(0, 60) }))
      .filter((m) => m.amount > 0 && m.label);

    res.setHeader('Cache-Control', 'public, s-maxage=15, stale-while-revalidate=30');
    return res.status(200).json({
      participant: {
        displayName: p.displayName || '',
        sumDonations: num(p.sumDonations),
        fundraisingGoal: num(p.fundraisingGoal),
        numDonations: num(p.numDonations),
        streamIsLive: !!p.streamIsLive,
      },
      donations,
      milestones,
      team: team
        ? { name: team.name || '', sumDonations: num(team.sumDonations), fundraisingGoal: num(team.fundraisingGoal) }
        : null,
      fetchedAt: Date.now(),
    });
  } catch (err) {
    const status = err && err.status === 404 ? 404 : 502;
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({
      error: status === 404 ? 'Participant not found. Check the participant ID.' : String(err && err.message ? err.message : err),
    });
  }
};
