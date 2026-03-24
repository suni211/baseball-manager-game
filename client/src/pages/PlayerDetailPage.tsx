import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import api from '../services/api';

function StatRow({ label, value, max = 100 }: { label: string; value: number; max?: number }) {
  const color = value >= 70 ? '#34d399' : value >= 50 ? '#fbbf24' : value >= 30 ? '#f97316' : '#f87171';
  return (
    <div style={{ marginBottom: 8 }}>
      <div className="flex-between text-sm">
        <span>{label}</span>
        <span className="font-bold">{value}</span>
      </div>
      <div className="stat-bar">
        <div className="stat-bar-fill" style={{ width: `${(value / max) * 100}%`, background: color }} />
      </div>
    </div>
  );
}

export default function PlayerDetailPage() {
  const { id } = useParams();
  const [player, setPlayer] = useState<any>(null);

  useEffect(() => {
    api.get(`/players/${id}`).then(res => setPlayer(res.data));
  }, [id]);

  if (!player) return <div className="text-center mt-4">로딩중...</div>;

  return (
    <div>
      <div className="flex-between mb-4">
        <div>
          <h1 className="text-xl font-bold">{player.name}</h1>
          <p className="text-muted">{player.team_name} | {player.position} | {player.grade}학년</p>
        </div>
        <div className="flex gap-2">
          <span className={`badge ${player.potential === 'S' ? 'gold' : player.potential === 'A' ? 'blue' : 'green'}`}>
            잠재력 {player.potential}
          </span>
          {player.is_injured && <span className="badge red">부상: {player.injury_type} ({player.injury_days_left}일)</span>}
        </div>
      </div>

      <div className="grid-3">
        {/* 기본 정보 */}
        <div className="card">
          <h3 className="font-bold mb-2">기본 정보</h3>
          <table>
            <tbody>
              <tr><td className="text-muted">나이</td><td>{player.age}세</td></tr>
              <tr><td className="text-muted">신장/체중</td><td>{player.height}cm / {player.weight}kg</td></tr>
              <tr><td className="text-muted">투타</td><td>{player.throws} / {player.bats}</td></tr>
              <tr><td className="text-muted">로스터</td><td>{player.roster_status}</td></tr>
              <tr><td className="text-muted">타순</td><td>{player.batting_order || '미정'}</td></tr>
              <tr><td className="text-muted">컨디션</td><td>{player.condition}</td></tr>
              <tr><td className="text-muted">피로도</td><td>{player.fatigue}</td></tr>
            </tbody>
          </table>
        </div>

        {/* 타격 스탯 */}
        <div className="card">
          <h3 className="font-bold mb-2">타격 능력</h3>
          <StatRow label="컨택" value={player.contact} />
          <StatRow label="파워" value={player.power} />
          <StatRow label="선구안" value={player.eye} />
          <StatRow label="스피드" value={player.speed} />
          <StatRow label="클러치" value={player.clutch} />
          <StatRow label="멘탈" value={player.mental} />
        </div>

        {/* 수비 스탯 */}
        <div className="card">
          <h3 className="font-bold mb-2">수비 능력</h3>
          <StatRow label="수비력" value={player.fielding} />
          <StatRow label="송구 강도" value={player.arm_strength} />
          <StatRow label="송구 정확도" value={player.arm_accuracy} />
          <StatRow label="반응속도" value={player.reaction} />
        </div>
      </div>

      {/* 투수 스탯 */}
      {player.is_pitcher && (
        <div className="grid-2 mt-4">
          <div className="card">
            <h3 className="font-bold mb-2">투구 능력</h3>
            <StatRow label="구속" value={player.velocity} />
            <StatRow label="제구력" value={player.control_stat} />
            <StatRow label="체력" value={player.stamina} />
            <StatRow label="변화구" value={player.breaking_ball} />
            <p className="text-sm text-muted mt-2">역할: {player.pitcher_role || '미정'}</p>
          </div>
          <div className="card">
            <h3 className="font-bold mb-2">구종</h3>
            {player.pitches && player.pitches.length > 0 ? (
              player.pitches.map((p: any, i: number) => (
                <StatRow key={i} label={p.pitch_type} value={p.level} />
              ))
            ) : (
              <p className="text-muted text-sm">구종 데이터 없음</p>
            )}
          </div>
        </div>
      )}

      {/* 스킬 */}
      {player.skills && player.skills.length > 0 && (
        <div className="card mt-4">
          <h3 className="font-bold mb-2">보유 스킬</h3>
          <div className="flex gap-2" style={{ flexWrap: 'wrap' }}>
            {player.skills.map((s: any, i: number) => (
              <div key={i} style={{ background: '#1e3a5f', padding: '8px 16px', borderRadius: 8 }}>
                <span className="font-bold text-yellow">{s.skill_name}</span>
                <span className="text-sm text-muted" style={{ marginLeft: 8 }}>Lv.{s.level}</span>
                <p className="text-sm text-muted">{s.description}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 투수 최근 등판/휴식 */}
      {player.is_pitcher && player.recent_pitch_counts && player.recent_pitch_counts.length > 0 && (
        <div className="card mt-4">
          <h3 className="font-bold mb-2">최근 등판 기록 (의무 휴식)</h3>
          <table>
            <thead>
              <tr><th>날짜</th><th>투구수</th><th>필요 휴식일</th><th>상태</th></tr>
            </thead>
            <tbody>
              {player.recent_pitch_counts.map((r: any, i: number) => {
                const pitches = r.pitches_thrown;
                const restDays = pitches >= 95 ? 4 : pitches >= 75 ? 3 : pitches >= 50 ? 2 : pitches >= 30 ? 1 : 0;
                const matchDate = new Date(r.match_date);
                const availableDate = new Date(matchDate);
                availableDate.setDate(availableDate.getDate() + restDays);
                const now = new Date();
                const isAvailable = now >= availableDate;
                return (
                  <tr key={i}>
                    <td>{matchDate.toLocaleDateString('ko-KR')}</td>
                    <td className="font-bold">{r.pitches_thrown}구</td>
                    <td>{restDays}일</td>
                    <td><span className={`badge ${isAvailable ? 'green' : 'red'}`}>{isAvailable ? '출전 가능' : `${Math.ceil((availableDate.getTime() - now.getTime()) / 86400000)}일 남음`}</span></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* 부상 이력 */}
      {player.injury_history && player.injury_history.length > 0 && (
        <div className="card mt-4">
          <h3 className="font-bold mb-2">부상 이력 ({player.injury_history_count || player.injury_history.length}회)</h3>
          <table>
            <thead>
              <tr><th>부상명</th><th>부위</th><th>심각도</th><th>기간</th><th>발생일</th><th>복귀일</th></tr>
            </thead>
            <tbody>
              {player.injury_history.map((h: any, i: number) => (
                <tr key={i}>
                  <td className="font-bold">{h.injury_type}</td>
                  <td>{h.body_part}</td>
                  <td><span className={`badge ${h.severity === '심각' ? 'red' : h.severity === '보통' ? 'yellow' : 'green'}`}>{h.severity}</span></td>
                  <td>{h.days_out}일</td>
                  <td className="text-sm">{new Date(h.occurred_at).toLocaleDateString('ko-KR')}</td>
                  <td className="text-sm">{h.recovered_at ? new Date(h.recovered_at).toLocaleDateString('ko-KR') : '치료중'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* 시즌 기록 */}
      {player.batting_stats && player.batting_stats.length > 0 && (
        <div className="card mt-4">
          <h3 className="font-bold mb-2">시즌 타격 기록</h3>
          <table>
            <thead>
              <tr>
                <th>시즌</th><th>경기</th><th>타수</th><th>안타</th><th>2루타</th><th>3루타</th>
                <th>홈런</th><th>타점</th><th>득점</th><th>볼넷</th><th>삼진</th><th>도루</th>
                <th>타율</th><th>출루율</th><th>장타율</th><th>OPS</th>
              </tr>
            </thead>
            <tbody>
              {player.batting_stats.map((s: any, i: number) => (
                <tr key={i}>
                  <td>{s.year}</td><td>{s.games}</td><td>{s.at_bats}</td><td>{s.hits}</td>
                  <td>{s.doubles}</td><td>{s.triples}</td><td>{s.home_runs}</td><td>{s.rbi}</td>
                  <td>{s.runs}</td><td>{s.walks}</td><td>{s.strikeouts}</td><td>{s.stolen_bases}</td>
                  <td>{(s.batting_avg || 0).toFixed(3)}</td><td>{(s.obp || 0).toFixed(3)}</td>
                  <td>{(s.slg || 0).toFixed(3)}</td><td>{(s.ops || 0).toFixed(3)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
