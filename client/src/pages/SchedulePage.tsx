import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import api from '../services/api';

interface Props {
  user: { teamId: number | null };
}

export default function SchedulePage({ user }: Props) {
  const [allMatches, setAllMatches] = useState<any[]>([]);
  const [filter, setFilter] = useState<string>('전체');
  const [viewMode, setViewMode] = useState<string>('내 팀');
  const [tournamentFilter, setTournamentFilter] = useState<string>('전체');
  const [loading, setLoading] = useState(true);
  const todayRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    loadMatches();
  }, [viewMode]);

  useEffect(() => {
    // 로드 후 오늘 날짜로 자동 스크롤
    if (!loading && todayRef.current) {
      todayRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [loading]);

  const loadMatches = async () => {
    setLoading(true);
    try {
      let url = '/matches/schedule';
      if (viewMode === '내 팀' && user.teamId) {
        url += `?teamId=${user.teamId}`;
      }
      const { data } = await api.get(url);
      setAllMatches(data || []);
    } catch (err) {
      console.error(err);
      setAllMatches([]);
    } finally {
      setLoading(false);
    }
  };

  // 대회 목록 추출
  const tournaments = Array.from(
    new Map(allMatches.filter(m => m.tournament_name).map(m => [m.tournament_name, m.tournament_name])).values()
  );

  const filtered = allMatches.filter(m => {
    if (filter !== '전체' && m.status !== filter) return false;
    if (tournamentFilter !== '전체' && m.tournament_name !== tournamentFilter) return false;
    return true;
  });

  // 날짜별 그룹화
  const grouped: Record<string, any[]> = {};
  filtered.forEach(m => {
    const d = new Date(m.match_date);
    const dateKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    if (!grouped[dateKey]) grouped[dateKey] = [];
    grouped[dateKey].push(m);
  });

  const today = new Date();
  const todayKey = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;

  const statusCounts = {
    '전체': allMatches.length,
    '예정': allMatches.filter(m => m.status === '예정').length,
    '진행중': allMatches.filter(m => m.status === '진행중').length,
    '완료': allMatches.filter(m => m.status === '완료').length,
  };

  const formatDate = (dateKey: string) => {
    const [y, mo, d] = dateKey.split('-').map(Number);
    const dt = new Date(y, mo - 1, d);
    const dayNames = ['일', '월', '화', '수', '목', '금', '토'];
    return `${mo}월 ${d}일 (${dayNames[dt.getDay()]})`;
  };

  const getDateLabel = (dateKey: string) => {
    if (dateKey === todayKey) return '오늘';
    const t = new Date(today);
    t.setDate(t.getDate() + 1);
    const tomorrowKey = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}-${String(t.getDate()).padStart(2, '0')}`;
    if (dateKey === tomorrowKey) return '내일';
    const y = new Date(today);
    y.setDate(y.getDate() - 1);
    const yesterdayKey = `${y.getFullYear()}-${String(y.getMonth() + 1).padStart(2, '0')}-${String(y.getDate()).padStart(2, '0')}`;
    if (dateKey === yesterdayKey) return '어제';
    return null;
  };

  return (
    <div>
      <div className="page-header">
        <h1>경기 일정</h1>
        <span style={{ color: 'var(--text-muted)', fontSize: 13 }}>
          전체 {allMatches.length}경기
        </span>
      </div>

      {/* 필터 컨트롤 영역 */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: 12,
        marginBottom: 16,
        alignItems: 'center',
        padding: '12px 16px',
        background: 'var(--bg-card)',
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border-primary)'
      }}>
        {/* 보기 모드 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>팀:</span>
          {['내 팀', '전체 경기'].map(mode => (
            <button
              key={mode}
              className={viewMode === mode ? 'primary sm' : 'secondary sm'}
              onClick={() => setViewMode(mode)}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {mode}
            </button>
          ))}
        </div>

        <div style={{ width: 1, height: 20, background: 'var(--border-primary)' }} />

        {/* 상태 필터 */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>상태:</span>
          {(['전체', '예정', '진행중', '완료'] as const).map(f => (
            <button
              key={f}
              className={filter === f ? 'primary sm' : 'secondary sm'}
              onClick={() => setFilter(f)}
              style={{ fontSize: 12, padding: '4px 10px' }}
            >
              {f}
              <span style={{ marginLeft: 4, opacity: 0.7, fontSize: 11 }}>
                {statusCounts[f]}
              </span>
            </button>
          ))}
        </div>

        {tournaments.length > 1 && (
          <>
            <div style={{ width: 1, height: 20, background: 'var(--border-primary)' }} />
            {/* 대회 필터 */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 600 }}>대회:</span>
              <button
                className={tournamentFilter === '전체' ? 'primary sm' : 'secondary sm'}
                onClick={() => setTournamentFilter('전체')}
                style={{ fontSize: 12, padding: '4px 10px' }}
              >
                전체
              </button>
              {tournaments.map(t => (
                <button
                  key={t}
                  className={tournamentFilter === t ? 'primary sm' : 'secondary sm'}
                  onClick={() => setTournamentFilter(t)}
                  style={{ fontSize: 12, padding: '4px 10px' }}
                >
                  {t}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {loading ? (
        <div className="loading">경기 일정 불러오는 중...</div>
      ) : filtered.length === 0 ? (
        <div className="empty-state">
          <p>표시할 경기가 없습니다</p>
        </div>
      ) : (
        Object.entries(grouped).map(([dateKey, matches]) => {
          const isToday = dateKey === todayKey;
          const isPast = dateKey < todayKey;
          const dateLabel = getDateLabel(dateKey);

          return (
            <div
              key={dateKey}
              ref={isToday ? todayRef : undefined}
              style={{ marginBottom: 20 }}
            >
              {/* 날짜 헤더 */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 16px',
                background: isToday ? 'rgba(59, 130, 246, 0.15)' : 'var(--bg-secondary)',
                borderRadius: 'var(--radius-sm)',
                marginBottom: 8,
                borderLeft: isToday ? '4px solid var(--blue)' : '4px solid var(--border-primary)',
              }}>
                <span style={{
                  fontWeight: 800,
                  fontSize: 14,
                  color: isToday ? 'var(--blue-light)' : isPast ? 'var(--text-muted)' : 'var(--text-primary)',
                }}>
                  {formatDate(dateKey)}
                </span>
                {dateLabel && (
                  <span style={{
                    fontSize: 11,
                    fontWeight: 700,
                    padding: '2px 8px',
                    borderRadius: 10,
                    background: isToday ? 'var(--blue)' : 'var(--bg-card)',
                    color: isToday ? '#fff' : 'var(--text-muted)',
                  }}>
                    {dateLabel}
                  </span>
                )}
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                  {matches.length}경기
                </span>
              </div>

              {/* 경기 목록 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {matches.map(m => {
                  const isHome = m.home_team_id === user.teamId;
                  const isAway = m.away_team_id === user.teamId;
                  const isMyMatch = isHome || isAway;
                  const isLive = m.status === '진행중';
                  const isCompleted = m.status === '완료';

                  let myResult = '';
                  if (isCompleted && isMyMatch) {
                    const myScore = isHome ? m.home_score : m.away_score;
                    const theirScore = isHome ? m.away_score : m.home_score;
                    myResult = myScore > theirScore ? '승' : myScore < theirScore ? '패' : '무';
                  }

                  const matchTime = new Date(m.match_date).toLocaleTimeString('ko-KR', {
                    hour: '2-digit',
                    minute: '2-digit',
                    hour12: false
                  });

                  return (
                    <div
                      key={m.id}
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        gap: 12,
                        padding: '10px 16px',
                        background: isLive ? 'rgba(239, 68, 68, 0.08)' : 'var(--bg-card)',
                        border: `1px solid ${isLive ? 'rgba(239, 68, 68, 0.3)' : isMyMatch ? 'var(--blue)' : 'var(--border-primary)'}`,
                        borderRadius: 'var(--radius-sm)',
                        borderLeft: isMyMatch ? '4px solid var(--blue)' : isLive ? '4px solid var(--red)' : undefined,
                        transition: 'all 0.15s ease',
                      }}
                    >
                      {/* 시간 */}
                      <div style={{ minWidth: 50, textAlign: 'center' }}>
                        {isLive ? (
                          <span className="live-indicator" style={{ fontSize: 11 }}>LIVE</span>
                        ) : (
                          <span style={{
                            fontSize: 14,
                            fontWeight: 800,
                            color: isCompleted ? 'var(--text-muted)' : 'var(--text-primary)',
                            fontVariantNumeric: 'tabular-nums',
                          }}>
                            {matchTime}
                          </span>
                        )}
                      </div>

                      {/* 대회명 */}
                      <div style={{ minWidth: 80, textAlign: 'center' }}>
                        <span style={{
                          fontSize: 10,
                          fontWeight: 700,
                          padding: '2px 6px',
                          borderRadius: 4,
                          background: 'var(--bg-secondary)',
                          color: 'var(--text-muted)',
                          whiteSpace: 'nowrap',
                        }}>
                          {m.tournament_name || '-'}
                        </span>
                        {m.stage && (
                          <span style={{
                            display: 'block',
                            fontSize: 9,
                            color: 'var(--text-muted)',
                            marginTop: 2,
                          }}>
                            {m.stage}
                          </span>
                        )}
                      </div>

                      {/* 팀 대진 */}
                      <div style={{
                        flex: 1,
                        display: 'grid',
                        gridTemplateColumns: '1fr auto 1fr',
                        alignItems: 'center',
                        gap: 8,
                      }}>
                        {/* 홈팀 */}
                        <div style={{ textAlign: 'right' }}>
                          <span style={{
                            fontSize: 14,
                            fontWeight: isHome ? 800 : 600,
                            color: isHome ? 'var(--blue-light)' : 'var(--text-primary)',
                          }}>
                            {m.home_name}
                          </span>
                        </div>

                        {/* 스코어 / VS */}
                        <div style={{
                          textAlign: 'center',
                          minWidth: 70,
                          padding: '4px 8px',
                          background: isCompleted || isLive ? 'var(--bg-secondary)' : 'transparent',
                          borderRadius: 6,
                        }}>
                          {isCompleted || isLive ? (
                            <span style={{
                              fontSize: 18,
                              fontWeight: 900,
                              fontVariantNumeric: 'tabular-nums',
                              color: isLive ? 'var(--red)' : 'var(--text-primary)',
                            }}>
                              {m.home_score} : {m.away_score}
                            </span>
                          ) : (
                            <span style={{
                              fontSize: 13,
                              fontWeight: 700,
                              color: 'var(--text-muted)',
                            }}>
                              VS
                            </span>
                          )}
                        </div>

                        {/* 원정팀 */}
                        <div style={{ textAlign: 'left' }}>
                          <span style={{
                            fontSize: 14,
                            fontWeight: isAway ? 800 : 600,
                            color: isAway ? 'var(--blue-light)' : 'var(--text-primary)',
                          }}>
                            {m.away_name}
                          </span>
                        </div>
                      </div>

                      {/* 결과/링크 */}
                      <div style={{
                        minWidth: 60,
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        gap: 4,
                      }}>
                        {myResult && (
                          <span style={{
                            fontSize: 12,
                            fontWeight: 800,
                            padding: '2px 10px',
                            borderRadius: 10,
                            background: myResult === '승'
                              ? 'rgba(34, 197, 94, 0.2)'
                              : myResult === '패'
                              ? 'rgba(239, 68, 68, 0.2)'
                              : 'rgba(156, 163, 175, 0.2)',
                            color: myResult === '승'
                              ? 'var(--green)'
                              : myResult === '패'
                              ? 'var(--red)'
                              : 'var(--text-muted)',
                          }}>
                            {myResult}
                          </span>
                        )}
                        {isLive && (
                          <Link
                            to={`/live/${m.id}`}
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: 'var(--red)',
                              textDecoration: 'none',
                            }}
                          >
                            관전하기
                          </Link>
                        )}
                        {isCompleted && (
                          <Link
                            to={`/match/${m.id}`}
                            style={{
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              textDecoration: 'none',
                            }}
                          >
                            상세
                          </Link>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })
      )}
    </div>
  );
}
