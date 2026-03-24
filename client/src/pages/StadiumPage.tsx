import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function StadiumPage({ user }: Props) {
  const [stadium, setStadium] = useState<any>(null);
  const [upgrades, setUpgrades] = useState<any[]>([]);
  const [message, setMessage] = useState('');

  useEffect(() => { loadData(); }, []);

  const loadData = async () => {
    const [sRes, uRes] = await Promise.all([api.get('/stadium'), api.get('/stadium/upgrades')]);
    setStadium(sRes.data);
    setUpgrades(uRes.data);
  };

  const doUpgrade = async (upgradeId: number) => {
    try {
      const { data } = await api.post('/stadium/upgrade', { upgradeId });
      setMessage(data.message);
      await loadData();
    } catch (err: any) {
      setMessage(err.response?.data?.error || '업그레이드 실패');
    }
  };

  if (!stadium) return <div className="text-center mt-4">로딩중...</div>;

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">구장 관리</h1>

      {message && <div className="card mb-4" style={{ background: '#065f46', padding: 12 }}>{message}</div>}

      <div className="card mb-4">
        <h2 className="text-lg font-bold mb-2">{stadium.name}</h2>
        <div className="grid-4">
          <div><p className="text-sm text-muted">수용 인원</p><p className="font-bold">{stadium.capacity}명</p></div>
          <div><p className="text-sm text-muted">그라운드 상태</p><p className="font-bold">{stadium.field_condition}/100</p></div>
          <div><p className="text-sm text-muted">외야 펜스</p><p className="font-bold">{stadium.fence_distance}m</p></div>
          <div><p className="text-sm text-muted">구장 레벨</p><p className="font-bold text-blue">Lv.{stadium.upgrade_level}</p></div>
        </div>
        <div className="flex gap-4 mt-4">
          <span className={`badge ${stadium.has_lights ? 'green' : 'silver'}`}>조명 {stadium.has_lights ? 'O' : 'X'}</span>
          <span className={`badge ${stadium.has_bullpen ? 'green' : 'silver'}`}>불펜 {stadium.has_bullpen ? 'O' : 'X'}</span>
          <span className={`badge ${stadium.has_batting_cage ? 'green' : 'silver'}`}>배팅케이지 {stadium.has_batting_cage ? 'O' : 'X'}</span>
          <span className={`badge ${stadium.has_video_room ? 'green' : 'silver'}`}>비디오룸 {stadium.has_video_room ? 'O' : 'X'}</span>
        </div>
      </div>

      <h3 className="font-bold mb-2">업그레이드</h3>
      <div className="grid-2">
        {upgrades.map(u => (
          <div key={u.id} className="card">
            <div className="flex-between mb-2">
              <h4 className="font-bold">{u.name}</h4>
              <span className="badge blue">Lv.{u.required_level} 이상</span>
            </div>
            <p className="text-sm text-muted">{u.description}</p>
            <p className="text-sm text-green mt-2">{u.effect_description}</p>
            <div className="flex-between mt-4">
              <span className="font-bold text-yellow">{Number(u.cost).toLocaleString()}원</span>
              <button className="primary" onClick={() => doUpgrade(u.id)}
                disabled={stadium.upgrade_level < u.required_level}
                style={{ fontSize: 12, padding: '4px 12px' }}>
                업그레이드
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
