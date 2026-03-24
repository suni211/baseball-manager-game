import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

const FIELD_POSITIONS = [
  { key: '포수', label: '포수', abbr: 'C', top: 78, left: 50 },
  { key: '1루수', label: '1루수', abbr: '1B', top: 55, left: 72 },
  { key: '2루수', label: '2루수', abbr: '2B', top: 40, left: 62 },
  { key: '유격수', label: '유격수', abbr: 'SS', top: 40, left: 38 },
  { key: '3루수', label: '3루수', abbr: '3B', top: 55, left: 28 },
  { key: '좌익수', label: '좌익수', abbr: 'LF', top: 18, left: 18 },
  { key: '중견수', label: '중견수', abbr: 'CF', top: 8, left: 50 },
  { key: '우익수', label: '우익수', abbr: 'RF', top: 18, left: 82 },
];

export default function LineupPage({ user }: Props) {
  const [players, setPlayers] = useState<any[]>([]);
  const [fieldSlots, setFieldSlots] = useState<Record<string, number>>({});
  const [battingOrder, setBattingOrder] = useState<string[]>([]);
  const [dhPlayer, setDhPlayer] = useState<number>(0);
  const [message, setMessage] = useState('');
  const [selectedPos, setSelectedPos] = useState<string | null>(null);

  useEffect(() => { loadPlayers(); }, []);

  const loadPlayers = async () => {
    const { data } = await api.get(`/players/team/${user.teamId}`);
    const rosterPlayers = data.filter((p: any) => p.roster_status === '선발로스터' && !p.is_pitcher && !p.is_injured);
    setPlayers(rosterPlayers);

    // 기존 타순 로드
    const existing = data.filter((p: any) => p.batting_order && !p.is_pitcher).sort((a: any, b: any) => a.batting_order - b.batting_order);
    if (existing.length === 9) {
      const slots: Record<string, number> = {};
      const order: string[] = [];
      existing.forEach((p: any) => {
        const pos = p.lineup_position || p.position;
        if (pos === '지명타자') {
          setDhPlayer(p.id);
        } else {
          slots[pos] = p.id;
        }
        order.push(pos);
      });
      setFieldSlots(slots);
      setBattingOrder(order);
    } else {
      // 기본 빈 슬롯
      const slots: Record<string, number> = {};
      FIELD_POSITIONS.forEach(fp => { slots[fp.key] = 0; });
      setFieldSlots(slots);
      setBattingOrder([...FIELD_POSITIONS.map(p => p.key), '지명타자']);
    }
  };

  const assignPlayer = (position: string, playerId: number) => {
    setFieldSlots(prev => ({ ...prev, [position]: playerId }));
    setSelectedPos(null);
    // 자동으로 타순에 추가
    if (!battingOrder.includes(position)) {
      setBattingOrder(prev => [...prev.filter(p => p !== position), position]);
    }
  };

  const removePlayer = (position: string) => {
    if (position === '지명타자') {
      setDhPlayer(0);
    } else {
      setFieldSlots(prev => ({ ...prev, [position]: 0 }));
    }
  };

  const getPlayer = (id: number) => players.find(p => p.id === id);

  const usedPlayerIds = [...Object.values(fieldSlots).filter(id => id > 0), dhPlayer].filter(id => id > 0);

  const allPositions = [...FIELD_POSITIONS.map(p => p.key), '지명타자'];
  const assignedPositions = allPositions.filter(pos => {
    if (pos === '지명타자') return dhPlayer > 0;
    return fieldSlots[pos] > 0;
  });

  // 타순 이동
  const moveOrder = (idx: number, dir: -1 | 1) => {
    const newOrder = [...battingOrder];
    const target = idx + dir;
    if (target < 0 || target >= newOrder.length) return;
    [newOrder[idx], newOrder[target]] = [newOrder[target], newOrder[idx]];
    setBattingOrder(newOrder);
  };

  const save = async () => {
    const filledCount = Object.values(fieldSlots).filter(id => id > 0).length + (dhPlayer > 0 ? 1 : 0);
    if (filledCount < 9) return setMessage('9명을 모두 배치해주세요');

    const ids = [...Object.values(fieldSlots).filter(id => id > 0), dhPlayer].filter(id => id > 0);
    if (new Set(ids).size !== 9) return setMessage('같은 선수를 중복 배치할 수 없습니다');

    // battingOrder 기반으로 lineup 생성
    const lineup: { playerId: number; battingOrder: number; position: string }[] = [];
    let order = 1;
    for (const pos of battingOrder) {
      const pid = pos === '지명타자' ? dhPlayer : fieldSlots[pos];
      if (pid && pid > 0) {
        lineup.push({ playerId: pid, battingOrder: order, position: pos });
        order++;
      }
    }

    if (lineup.length !== 9) return setMessage('타순 9명을 완성해주세요');

    try {
      await api.post('/players/lineup', { lineup });
      setMessage('타순 저장 완료!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || '저장 실패');
    }
  };

  const statColor = (val: number) => val >= 70 ? 'var(--green-light)' : val >= 50 ? 'var(--yellow-light)' : 'var(--red-light)';

  return (
    <div>
      <div className="page-header">
        <h1>타순 / 포지션 설정</h1>
        <button className="primary" onClick={save}>타순 저장</button>
      </div>

      {message && (
        <div className="card mb-4" style={{ background: message.includes('완료') ? 'var(--green-dim)' : 'var(--red-dim)', padding: 12, borderColor: message.includes('완료') ? '#065f46' : '#7f1d1d' }}>
          {message}
        </div>
      )}

      <div className="grid-2">
        {/* 왼쪽: 야구장 다이아몬드 */}
        <div className="card">
          <h3 className="font-bold mb-3">수비 배치</h3>
          <div style={{
            position: 'relative',
            width: '100%',
            paddingBottom: '90%',
            background: 'radial-gradient(ellipse at 50% 80%, #1a3a1a 0%, #0d1117 70%)',
            borderRadius: 'var(--radius-lg)',
            overflow: 'hidden',
            border: '1px solid var(--border-primary)'
          }}>
            {/* 내야 다이아몬드 라인 */}
            <svg style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: '100%' }} viewBox="0 0 100 100">
              <polygon points="50,75 72,52 50,32 28,52" fill="none" stroke="#2d4a2d" strokeWidth="0.5" />
              <line x1="50" y1="100" x2="50" y2="32" stroke="#2d4a2d" strokeWidth="0.3" strokeDasharray="2,2" />
              {/* 외야 호 */}
              <path d="M 10,50 Q 50,0 90,50" fill="none" stroke="#2d4a2d" strokeWidth="0.3" />
            </svg>

            {/* 포지션 슬롯 */}
            {FIELD_POSITIONS.map(fp => {
              const playerId = fieldSlots[fp.key] || 0;
              const player = getPlayer(playerId);
              const isSelected = selectedPos === fp.key;

              return (
                <div
                  key={fp.key}
                  onClick={() => setSelectedPos(isSelected ? null : fp.key)}
                  style={{
                    position: 'absolute',
                    top: `${fp.top}%`,
                    left: `${fp.left}%`,
                    transform: 'translate(-50%, -50%)',
                    cursor: 'pointer',
                    zIndex: 10,
                    textAlign: 'center',
                  }}
                >
                  <div style={{
                    width: player ? 72 : 56,
                    height: player ? 72 : 56,
                    borderRadius: '50%',
                    background: player ? 'var(--blue)' : isSelected ? 'var(--blue-dim)' : 'rgba(30,41,59,0.8)',
                    border: `2px solid ${isSelected ? 'var(--blue-light)' : player ? 'var(--blue-light)' : 'var(--border-secondary)'}`,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    transition: 'all 0.2s',
                    boxShadow: isSelected ? '0 0 16px rgba(59,130,246,0.4)' : player ? '0 0 8px rgba(59,130,246,0.2)' : 'none',
                  }}>
                    {player ? (
                      <>
                        <span style={{ fontSize: 10, fontWeight: 800, color: '#fff' }}>{fp.abbr}</span>
                        <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', maxWidth: 60, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{player.name}</span>
                      </>
                    ) : (
                      <span style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)' }}>{fp.abbr}</span>
                    )}
                  </div>
                  {player && (
                    <button
                      onClick={e => { e.stopPropagation(); removePlayer(fp.key); }}
                      style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: 'var(--red)', color: '#fff', fontSize: 10, border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0 }}
                    >✕</button>
                  )}
                </div>
              );
            })}

            {/* 홈플레이트 */}
            <div style={{ position: 'absolute', bottom: '5%', left: '50%', transform: 'translateX(-50%)', width: 14, height: 14, background: '#fff', clipPath: 'polygon(50% 0%, 100% 35%, 100% 100%, 0% 100%, 0% 35%)', opacity: 0.6 }} />
          </div>

          {/* 지명타자 */}
          <div style={{ marginTop: 16, padding: 12, background: 'var(--bg-secondary)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-primary)' }}>
            <div className="flex-between">
              <span className="font-bold text-sm">DH (지명타자)</span>
              {dhPlayer > 0 ? (
                <div className="flex gap-2" style={{ alignItems: 'center' }}>
                  <span className="font-bold">{getPlayer(dhPlayer)?.name}</span>
                  <button className="ghost sm" onClick={() => setDhPlayer(0)} style={{ color: 'var(--red)', padding: '2px 6px' }}>✕</button>
                </div>
              ) : (
                <select value={0} onChange={e => setDhPlayer(parseInt(e.target.value))} style={{ width: 200 }}>
                  <option value={0}>-- 선택 --</option>
                  {players.filter(p => !usedPlayerIds.includes(p.id)).map(p => (
                    <option key={p.id} value={p.id}>{p.name} ({p.position}) 컨{p.contact} 파{p.power}</option>
                  ))}
                </select>
              )}
            </div>
          </div>
        </div>

        {/* 오른쪽: 선수 선택 + 타순 */}
        <div>
          {/* 선수 선택 패널 (포지션 클릭 시 표시) */}
          {selectedPos && (
            <div className="card mb-3" style={{ borderColor: 'var(--blue)', maxHeight: 300, overflow: 'auto' }}>
              <h3 className="font-bold mb-2 text-blue">{selectedPos} 선수 선택</h3>
              {players.filter(p => !usedPlayerIds.includes(p.id)).length === 0 ? (
                <p className="text-sm text-muted">배치 가능한 선수가 없습니다</p>
              ) : (
                players.filter(p => !usedPlayerIds.includes(p.id)).sort((a, b) => {
                  // 해당 포지션 선수 우선
                  const aMatch = a.position === selectedPos ? 1 : 0;
                  const bMatch = b.position === selectedPos ? 1 : 0;
                  if (bMatch !== aMatch) return bMatch - aMatch;
                  return (b.contact + b.power) - (a.contact + a.power);
                }).map(p => (
                  <div
                    key={p.id}
                    onClick={() => assignPlayer(selectedPos, p.id)}
                    style={{
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      padding: '8px 12px', borderBottom: '1px solid var(--border-primary)',
                      cursor: 'pointer', transition: 'background 0.15s',
                      background: p.position === selectedPos ? 'rgba(59,130,246,0.08)' : 'transparent'
                    }}
                    onMouseOver={e => (e.currentTarget.style.background = 'var(--bg-card-hover)')}
                    onMouseOut={e => (e.currentTarget.style.background = p.position === selectedPos ? 'rgba(59,130,246,0.08)' : 'transparent')}
                  >
                    <div>
                      <span className="font-bold">{p.name}</span>
                      <span className="text-xs text-muted" style={{ marginLeft: 6 }}>{p.position}</span>
                      {p.position === selectedPos && <span className="badge green" style={{ marginLeft: 6 }}>적합</span>}
                    </div>
                    <div className="flex gap-3 text-sm">
                      <span style={{ color: statColor(p.contact) }}>컨{p.contact}</span>
                      <span style={{ color: statColor(p.power) }}>파{p.power}</span>
                      <span style={{ color: statColor(p.speed) }}>스{p.speed}</span>
                      <span style={{ color: statColor(p.fielding) }}>수{p.fielding}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* 타순 */}
          <div className="card">
            <h3 className="font-bold mb-3">타순 (위에서부터 1번)</h3>
            <p className="text-xs text-muted mb-3">드래그하거나 화살표로 순서를 변경하세요</p>
            {(() => {
              const orderedPositions = battingOrder.filter(pos => {
                if (pos === '지명타자') return dhPlayer > 0;
                return (fieldSlots[pos] || 0) > 0;
              });
              return orderedPositions.length === 0 ? (
                <div className="empty-state"><p>필드에 선수를 배치하면 타순이 표시됩니다</p></div>
              ) : (
                orderedPositions.map((pos, idx) => {
                  const pid = pos === '지명타자' ? dhPlayer : fieldSlots[pos];
                  const player = getPlayer(pid);
                  if (!player) return null;
                  return (
                    <div key={pos} style={{
                      display: 'flex', alignItems: 'center', gap: 10,
                      padding: '8px 10px', borderBottom: '1px solid var(--border-primary)',
                    }}>
                      <span className="font-black text-blue" style={{ width: 28, textAlign: 'center', fontSize: 16 }}>{idx + 1}</span>
                      <div style={{ flex: 1 }}>
                        <span className="font-bold">{player.name}</span>
                        <span className="badge blue" style={{ marginLeft: 8, fontSize: 10 }}>{pos}</span>
                      </div>
                      <div className="text-xs text-muted">
                        컨{player.contact} 파{player.power} 스{player.speed}
                      </div>
                      <div className="flex-col gap-1">
                        <button className="ghost sm" onClick={() => moveOrder(battingOrder.indexOf(pos), -1)} style={{ padding: '0 4px', fontSize: 10, lineHeight: 1 }} disabled={idx === 0}>▲</button>
                        <button className="ghost sm" onClick={() => moveOrder(battingOrder.indexOf(pos), 1)} style={{ padding: '0 4px', fontSize: 10, lineHeight: 1 }} disabled={idx === orderedPositions.length - 1}>▼</button>
                      </div>
                    </div>
                  );
                })
              );
            })()}
          </div>
        </div>
      </div>
    </div>
  );
}
