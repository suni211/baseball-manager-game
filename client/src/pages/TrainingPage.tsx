import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function TrainingPage({ user }: Props) {
  const [players, setPlayers] = useState<any[]>([]);
  const [menus, setMenus] = useState<any[]>([]);
  const [selectedPlayer, setSelectedPlayer] = useState<number | null>(null);
  const [selectedMenu, setSelectedMenu] = useState<number | null>(null);
  const [result, setResult] = useState<string>('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    const [playersRes, menusRes] = await Promise.all([
      api.get(`/players/team/${user.teamId}`),
      api.get('/training/menus')
    ]);
    setPlayers(playersRes.data.filter((p: any) => !p.is_injured));
    setMenus(menusRes.data);
  };

  const handleTrain = async () => {
    if (!selectedPlayer || !selectedMenu) return;
    setLoading(true);
    setResult('');
    try {
      const { data } = await api.post('/training/train', { playerId: selectedPlayer, menuId: selectedMenu });
      if (data.injury) {
        setResult(data.message);
      } else {
        setResult(data.message);
      }
      await loadData();
    } catch (err: any) {
      setResult(err.response?.data?.error || '훈련 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleRest = async (playerId: number) => {
    await api.post('/training/rest', { playerId });
    await loadData();
    setResult('휴식 완료! 피로도 -30, 컨디션 +10');
  };

  const sp = players.find(p => p.id === selectedPlayer);

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">훈련</h1>

      <div className="grid-2">
        {/* 선수 선택 */}
        <div className="card">
          <h3 className="font-bold mb-2">선수 선택</h3>
          <div style={{ maxHeight: 400, overflow: 'auto' }}>
            {players.map(p => (
              <div
                key={p.id}
                onClick={() => setSelectedPlayer(p.id)}
                style={{
                  padding: '8px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedPlayer === p.id ? '#1e3a5f' : 'transparent',
                  marginBottom: 4,
                  display: 'flex',
                  justifyContent: 'space-between'
                }}
              >
                <span>
                  <span className="font-bold">{p.name}</span>
                  <span className="text-sm text-muted"> {p.position} {p.grade}학년</span>
                </span>
                <span className="text-sm">
                  컨디션 {p.condition} | 피로 <span className={p.fatigue > 70 ? 'text-red' : ''}>{p.fatigue}</span>
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* 훈련 메뉴 */}
        <div className="card">
          <h3 className="font-bold mb-2">훈련 메뉴</h3>
          {sp && (
            <p className="text-sm mb-2">
              선택: <span className="text-blue font-bold">{sp.name}</span> (컨디션 {sp.condition} / 피로 {sp.fatigue})
            </p>
          )}
          <div style={{ maxHeight: 300, overflow: 'auto' }}>
            {menus.map(m => (
              <div
                key={m.id}
                onClick={() => setSelectedMenu(m.id)}
                style={{
                  padding: '10px 12px',
                  borderRadius: 8,
                  cursor: 'pointer',
                  background: selectedMenu === m.id ? '#1e3a5f' : '#0a0e17',
                  marginBottom: 6,
                  border: '1px solid #1f2937'
                }}
              >
                <div className="flex-between">
                  <span className="font-bold">{m.name}</span>
                  <span className={`badge ${m.category === '타격' ? 'gold' : m.category === '투구' ? 'blue' : m.category === '수비' ? 'green' : 'silver'}`}>
                    {m.category}
                  </span>
                </div>
                <p className="text-sm text-muted">{m.description}</p>
                <div className="flex gap-4 text-sm mt-2">
                  <span>피로 +{m.fatigue_cost}</span>
                  <span>성장 {m.stat_gain_min}~{m.stat_gain_max}</span>
                  <span className={m.injury_risk > 0.03 ? 'text-red' : 'text-muted'}>
                    부상위험 {(m.injury_risk * 100).toFixed(1)}%
                  </span>
                </div>
              </div>
            ))}
          </div>

          <div className="flex gap-2 mt-4">
            <button
              className="primary"
              onClick={handleTrain}
              disabled={!selectedPlayer || !selectedMenu || loading}
              style={{ flex: 1 }}
            >
              {loading ? '훈련중...' : '훈련 시작'}
            </button>
            {selectedPlayer && (
              <button className="secondary" onClick={() => handleRest(selectedPlayer)}>
                휴식
              </button>
            )}
          </div>

          {result && (
            <div className="mt-2" style={{
              padding: 12,
              borderRadius: 8,
              background: result.includes('부상') ? '#7f1d1d' : '#065f46',
              fontSize: 14
            }}>
              {result}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
