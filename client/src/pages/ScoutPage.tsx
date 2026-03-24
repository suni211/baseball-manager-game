import { useState, useEffect } from 'react';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function ScoutPage({ user }: Props) {
  const [prospects, setProspects] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    loadProspects();
  }, []);

  const loadProspects = async () => {
    const { data } = await api.get('/scout/prospects');
    setProspects(data);
  };

  const handleScout = async (prospectId: number) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/scout/scout/${prospectId}`);
      setMessage(data.message);
      await loadProspects();
    } catch (err: any) {
      setMessage(err.response?.data?.error || '스카우트 실패');
    } finally {
      setLoading(false);
    }
  };

  const handleCommit = async (prospectId: number) => {
    setLoading(true);
    try {
      const { data } = await api.post(`/scout/commit/${prospectId}`);
      setMessage(data.message);
      await loadProspects();
    } catch (err: any) {
      setMessage(err.response?.data?.error || '영입 실패');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-xl font-bold mb-4">스카우트</h1>
      <p className="text-muted mb-4">중학교 유망주를 스카우트하여 다음 시즌 신입생으로 영입하세요. 스카우트 비용: 200,000원</p>

      {message && (
        <div className="card mb-4" style={{ background: '#065f46', padding: 12 }}>
          {message}
        </div>
      )}

      {prospects.length === 0 ? (
        <div className="card text-center">
          <p className="text-muted">현재 스카우트 가능한 유망주가 없습니다. 오프시즌에 유망주가 생성됩니다.</p>
        </div>
      ) : (
        <div className="grid-3">
          {prospects.map(p => (
            <div key={p.id} className="card">
              <div className="flex-between mb-2">
                <h3 className="font-bold">{p.name}</h3>
                <span className={`badge ${
                  p.potential === 'S' ? 'gold' : p.potential === 'A' ? 'blue' : p.potential === 'B' ? 'green' : 'silver'
                }`}>
                  잠재력 {p.potential}
                </span>
              </div>
              <p className="text-sm text-muted">{p.school_name} | {p.position}</p>
              <p className="text-sm mt-2">종합 평가: <span className="font-bold text-yellow">{p.overall_rating}</span></p>

              {p.scouted_by === user.teamId && (
                <div className="mt-2" style={{ fontSize: 12, color: '#9ca3af' }}>
                  {p.preview_contact && <span>컨택 ~{p.preview_contact} | </span>}
                  {p.preview_power && <span>파워 ~{p.preview_power} | </span>}
                  {p.preview_speed && <span>스피드 ~{p.preview_speed}</span>}
                </div>
              )}

              <div className="flex gap-2 mt-4">
                {p.scouted_by !== user.teamId ? (
                  <button className="secondary" onClick={() => handleScout(p.id)} disabled={loading} style={{ width: '100%' }}>
                    스카우트 (200,000원)
                  </button>
                ) : (
                  <button className="primary" onClick={() => handleCommit(p.id)} disabled={loading} style={{ width: '100%' }}>
                    영입 확정
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
