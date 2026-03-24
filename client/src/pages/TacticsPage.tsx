import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function TacticsPage({ user }: Props) {
  const [tactics, setTactics] = useState<any>(null);
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => { loadTactics(); }, []);

  const loadTactics = async () => {
    const { data } = await api.get('/tactics');
    setTactics(data);
  };

  const save = async () => {
    setSaving(true);
    try {
      await api.put('/tactics', tactics);
      setMessage('전술 저장 완료!');
      setTimeout(() => setMessage(''), 3000);
    } catch (err: any) {
      setMessage(err.response?.data?.error || '저장 실패');
    } finally { setSaving(false); }
  };

  if (!tactics) return <div className="text-center mt-4">로딩중...</div>;

  const SliderField = ({ label, field, min = 0, max = 100, desc }: { label: string; field: string; min?: number; max?: number; desc: string }) => (
    <div style={{ marginBottom: 20 }}>
      <div className="flex-between">
        <label className="font-bold">{label}</label>
        <span className="text-blue font-bold">{tactics[field]}</span>
      </div>
      <input type="range" min={min} max={max} value={tactics[field]}
        onChange={e => setTactics({ ...tactics, [field]: parseInt(e.target.value) })}
        style={{ width: '100%', accentColor: '#2563eb' }} />
      <p className="text-sm text-muted">{desc}</p>
    </div>
  );

  return (
    <div>
      <div className="flex-between mb-4">
        <h1 className="text-xl font-bold">전술 설정</h1>
        <button className="primary" onClick={save} disabled={saving}>
          {saving ? '저장중...' : '전술 저장'}
        </button>
      </div>

      {message && <div className="card mb-4" style={{ background: '#065f46', padding: 12 }}>{message}</div>}

      <div className="grid-2">
        <div className="card">
          <h3 className="font-bold mb-4">공격 전술</h3>
          <SliderField label="도루 적극성" field="steal_tendency" desc="높을수록 도루를 자주 시도합니다" />
          <SliderField label="번트 적극성" field="bunt_tendency" desc="높을수록 희생번트를 자주 사용합니다" />
          <SliderField label="히트앤런" field="hit_and_run" desc="높을수록 히트앤런 작전을 자주 사용합니다" />
          <SliderField label="공격 성향" field="aggression" desc="전반적인 공격 성향 (높음=적극적)" />
        </div>

        <div className="card">
          <h3 className="font-bold mb-4">투수/수비 전술</h3>
          <SliderField label="투수 교체 기준 (투구수)" field="pitcher_change_threshold" min={50} max={105}
            desc="이 투구수에 도달하면 투수를 교체합니다 (대회 제한: 105구)" />
          <SliderField label="마무리 등판 이닝" field="closer_inning" min={7} max={9}
            desc="이 이닝부터 마무리 투수를 투입합니다" />
          <SliderField label="고의사구 기준 (파워)" field="intentional_walk_threshold" min={50} max={100}
            desc="타자의 파워가 이 이상이면 고의사구를 고려합니다" />
          <SliderField label="대타 기준 (컨택)" field="pinch_hitter_threshold" min={30} max={100}
            desc="7회 이후 접전 시, 타자 컨택이 이 이하이면 대타 투입" />

          <div style={{ marginBottom: 20 }}>
            <div className="flex-between">
              <label className="font-bold">수비 시프트</label>
              <button
                className={tactics.defensive_shift ? 'primary' : 'secondary'}
                onClick={() => setTactics({ ...tactics, defensive_shift: !tactics.defensive_shift })}
                style={{ padding: '4px 12px', fontSize: 12 }}
              >
                {tactics.defensive_shift ? 'ON' : 'OFF'}
              </button>
            </div>
            <p className="text-sm text-muted mt-2">수비 시프트를 사용합니다 (풀 히터 대응)</p>
          </div>
        </div>
      </div>

      <div className="card mt-4">
        <h3 className="font-bold mb-2">전술 가이드</h3>
        <div className="grid-3">
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-yellow">스몰볼</p>
            <p className="text-sm text-muted">도루 70+, 번트 60+, 공격 30~</p>
            <p className="text-sm">번트와 도루로 한 점씩 만들어가는 전략</p>
          </div>
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-red">파워 야구</p>
            <p className="text-sm text-muted">도루 20~, 번트 10~, 공격 80+</p>
            <p className="text-sm">장타와 홈런으로 한 방에 뒤집는 전략</p>
          </div>
          <div style={{ padding: 12, background: '#0a0e17', borderRadius: 8 }}>
            <p className="font-bold text-blue">밸런스</p>
            <p className="text-sm text-muted">도루 50, 번트 30, 공격 50</p>
            <p className="text-sm">상황에 따라 유연하게 대처하는 전략</p>
          </div>
        </div>
      </div>
    </div>
  );
}
