import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function FinancePage({ user }: Props) {
  const [finances, setFinances] = useState<{ budget: number; transactions: any[] }>({ budget: 0, transactions: [] });
  const [sponsors, setSponsors] = useState<any[]>([]);
  const [mySponsors, setMySponsors] = useState<any[]>([]);
  const [equipment, setEquipment] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [finRes, sponsorsRes, mySponRes, equipRes] = await Promise.all([
      api.get(`/teams/${user.teamId}/finances`),
      api.get('/sponsors'),
      api.get('/sponsors/my'),
      api.get('/equipment')
    ]);
    setFinances(finRes.data);
    setSponsors(sponsorsRes.data);
    setMySponsors(mySponRes.data);
    setEquipment(equipRes.data);
  };

  const signSponsor = async (sponsorId: number) => {
    try {
      const { data } = await api.post(`/sponsors/sign/${sponsorId}`);
      setMessage(data.message);
      await loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.error || '계약 실패');
    }
  };

  const buyEquipment = async (equipmentId: number) => {
    try {
      const { data } = await api.post(`/teams/${user.teamId}/buy-equipment`, { equipmentId, quantity: 1 });
      setMessage(data.message);
      await loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.error || '구매 실패');
    }
  };

  return (
    <div>
      <div className="flex-between mb-4">
        <h1 className="text-xl font-bold">재정 관리</h1>
        <div className="text-lg font-bold text-green">{Number(finances.budget).toLocaleString()}원</div>
      </div>

      {message && (
        <div className="card mb-4" style={{ background: '#065f46', padding: 12, fontSize: 14 }}>
          {message}
          <button onClick={() => setMessage('')} style={{ float: 'right', background: 'none', color: '#9ca3af', padding: 0 }}>X</button>
        </div>
      )}

      <div className="grid-2 mb-4">
        {/* 스폰서 */}
        <div className="card">
          <h3 className="font-bold mb-2">스폰서 계약</h3>
          <div className="mb-2">
            <p className="text-sm text-muted">현재 스폰서: {mySponsors.map(s => s.name).join(', ') || '없음'}</p>
          </div>
          {sponsors.filter(s => !mySponsors.find(ms => ms.id === s.id)).map(s => (
            <div key={s.id} style={{ padding: '10px', background: '#0a0e17', borderRadius: 8, marginBottom: 8 }}>
              <div className="flex-between">
                <span className="font-bold">{s.name}</span>
                <span className={`badge ${s.tier === '골드' ? 'gold' : s.tier === '실버' ? 'silver' : 'bronze'}`}>{s.tier}</span>
              </div>
              <p className="text-sm text-green">+{Number(s.money_per_season).toLocaleString()}원/시즌</p>
              <p className="text-sm text-muted">{s.bonus_description}</p>
              {s.requirement_min_reputation > 0 && (
                <p className="text-sm text-yellow">필요 평판: {s.requirement_min_reputation}</p>
              )}
              <button className="primary mt-2" onClick={() => signSponsor(s.id)} style={{ width: '100%', padding: 6, fontSize: 12 }}>
                계약
              </button>
            </div>
          ))}
        </div>

        {/* 장비 구매 */}
        <div className="card">
          <h3 className="font-bold mb-2">장비 구매</h3>
          {equipment.map(e => (
            <div key={e.id} style={{ padding: '8px', background: '#0a0e17', borderRadius: 8, marginBottom: 6 }}>
              <div className="flex-between">
                <span className="font-bold text-sm">{e.name}</span>
                <span className="text-sm">{Number(e.price).toLocaleString()}원</span>
              </div>
              <p className="text-sm text-muted">
                {e.category} {e.stat_bonus_target && `| ${e.stat_bonus_target} +${e.stat_bonus_amount}`}
              </p>
              <button className="secondary mt-2" onClick={() => buyEquipment(e.id)} style={{ width: '100%', padding: 4, fontSize: 11 }}>
                구매
              </button>
            </div>
          ))}
        </div>
      </div>

      {/* 거래 내역 */}
      <div className="card">
        <h3 className="font-bold mb-2">거래 내역</h3>
        <table>
          <thead>
            <tr>
              <th>날짜</th>
              <th>유형</th>
              <th>금액</th>
              <th>설명</th>
            </tr>
          </thead>
          <tbody>
            {finances.transactions.map(t => (
              <tr key={t.id}>
                <td className="text-sm">{new Date(t.created_at).toLocaleDateString('ko-KR')}</td>
                <td><span className="badge blue">{t.type}</span></td>
                <td className={Number(t.amount) > 0 ? 'text-green font-bold' : 'text-red font-bold'}>
                  {Number(t.amount) > 0 ? '+' : ''}{Number(t.amount).toLocaleString()}원
                </td>
                <td className="text-sm">{t.description}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
