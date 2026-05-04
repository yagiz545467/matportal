import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Calculator, Trophy, Check, X, ArrowLeft, BookOpen, Zap, LogIn, LogOut, MessageCircle, BarChart3, Settings, Users, Send, Swords, Clock, Volume2 } from 'lucide-react';
import CanvasBoard from './components/CanvasBoard';
import initialQuestions from './questions.json';
import { supabase } from './supabaseClient';

const NOTIFICATION_SOUND = "https://assets.mixkit.co/active_storage/sfx/2354/2354-preview.mp3";

const Header = ({ user, profile, onNavigate }) => (
  <header>
    <div className="nav-container">
      <div style={{ fontWeight: 600, fontSize: '18px', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }} onClick={() => onNavigate('landing')}>
        <Calculator size={20} /> <span>Mat Portal</span>
      </div>
      <div className="nav-links">
        <span onClick={() => onNavigate('landing')}>Ana Sayfa</span>
        <span onClick={() => onNavigate('topic')}>Soru Çöz</span>
        <span onClick={() => onNavigate('leaderboard')}>Sıralama</span>
        <span onClick={() => onNavigate('chat')}>Sohbet & Kapışma</span>
        {user ? (
          <>
            <span onClick={() => onNavigate('student-panel')}>Öğrenci Paneli</span>
            {(profile?.role === 'teacher' || profile?.role === 'admin') && (
              <span onClick={() => onNavigate('admin-panel')} style={{ color: '#ff9500' }}>Öğretmen Paneli</span>
            )}
            <div className="user-profile-header" onClick={() => onNavigate('profile')}>
              <img src={user.user_metadata.avatar_url} alt="Avatar" />
              <span>{user.user_metadata.full_name}</span>
            </div>
          </>
        ) : (
          <button className="btn-apple btn-primary" style={{ padding: '8px 16px', fontSize: '14px' }} onClick={() => onNavigate('profile')}>
            Giriş Yap
          </button>
        )}
      </div>
    </div>
  </header>
);

function App() {
  const [page, setPage] = useState('landing');
  const [user, setUser] = useState(null);
  const [profile, setProfile] = useState(null);
  
  // Quiz State
  const [selectedTopic, setSelectedTopic] = useState('Hepsi');
  const [selectedDifficulty, setSelectedDifficulty] = useState('Hepsi');
  const [questions, setQuestions] = useState([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [answered, setAnswered] = useState(false);
  const [selected, setSelected] = useState(null);
  
  // Leaderboard & Profiles
  const [leaderboardData, setLeaderboardData] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [studentStats, setStudentStats] = useState(null);
  
  // DM & Multiplayer State
  const [selectedDMUser, setSelectedDMUser] = useState(null);
  const [dmMessages, setDmMessages] = useState([]);
  const [newDM, setNewDM] = useState('');
  const [activeBattle, setActiveBattle] = useState(null);
  const [battleTimeLeft, setBattleTimeLeft] = useState(0);
  const dmEndRef = useRef(null);

  // Constants
  const topics = ['Hepsi', ...new Set(initialQuestions.map(q => q.title))];
  const difficulties = ['Hepsi', 'Kolay', 'Orta', 'Zor'];

  // Sound ref
  const notificationAudio = useRef(new Audio(NOTIFICATION_SOUND));

  // Core Auth & Profile Sync
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => handleUserSession(session?.user ?? null));
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_e, session) => handleUserSession(session?.user ?? null));
    return () => subscription.unsubscribe();
  }, []);

  const handleUserSession = async (currentUser) => {
    setUser(currentUser);
    if (currentUser) {
      const { data, error } = await supabase.from('profiles').upsert([{
        id: currentUser.id, email: currentUser.email, full_name: currentUser.user_metadata.full_name, avatar_url: currentUser.user_metadata.avatar_url
      }], { onConflict: 'id' }).select().single();
      if (error) console.error("Profil Oluşturma Hatası:", error.message);
      if (data) setProfile(data);
    } else {
      setProfile(null);
    }
  };

  const handleGoogleLogin = async () => supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin } });
  const handleLogout = async () => { await supabase.auth.signOut(); setPage('landing'); };

  // Global Realtime Listeners
  useEffect(() => {
    if (!user) return;
    const globalChannel = supabase.channel('global_notifications')
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'battles' }, payload => {
        const battle = payload.new;
        if (battle.invitee_id === user.id && battle.status === 'pending') {
          notificationAudio.current.play().catch(() => {});
          if (window.confirm(`${battle.inviter_name} seni kapışmaya davet etti! Kabul ediyor musun?`)) {
            acceptBattle(battle.id);
          } else {
            declineBattle(battle.id);
          }
        }
      })
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'battles' }, payload => {
        const battle = payload.new;
        if (activeBattle && battle.id === activeBattle.id) {
          setActiveBattle(battle);
          if (battle.status === 'active' && page !== 'battle-arena') startBattleMode(battle);
        }
        if (battle.inviter_id === user.id && battle.status === 'active' && page !== 'battle-arena') {
           setActiveBattle(battle);
           startBattleMode(battle);
        }
      })
      .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages' }, payload => {
        const msg = payload.new;
        if (msg.receiver_id === user.id) notificationAudio.current.play().catch(() => {});
      })
      .subscribe();
    return () => { supabase.removeChannel(globalChannel); };
  }, [user, activeBattle, page]);

  // DM Realtime
  useEffect(() => {
    if (page === 'chat' && selectedDMUser && user) {
      fetchDMs(selectedDMUser.id);
      const dmChannel = supabase.channel(`dm_${selectedDMUser.id}`)
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'private_messages' }, payload => {
          const msg = payload.new;
          const isRelevant = (msg.sender_id === user.id && msg.receiver_id === selectedDMUser.id) ||
                            (msg.sender_id === selectedDMUser.id && msg.receiver_id === user.id);
          if (isRelevant) {
            setDmMessages(prev => {
              if (prev.find(m => m.id === msg.id)) return prev;
              return [...prev, msg];
            });
          }
        }).subscribe();
      return () => { supabase.removeChannel(dmChannel); };
    }
  }, [page, selectedDMUser, user]);

  useEffect(() => { dmEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [dmMessages]);

  const fetchDMs = async (otherUserId) => {
    const { data } = await supabase.from('private_messages')
      .select('*')
      .or(`and(sender_id.eq.${user.id},receiver_id.eq.${otherUserId}),and(sender_id.eq.${otherUserId},receiver_id.eq.${user.id})`)
      .order('created_at', { ascending: true });
    if (data) setDmMessages(data);
  };

  const sendDM = async (e) => {
    e.preventDefault();
    if (!newDM.trim() || !user || !selectedDMUser) return;
    const tempMsg = { id: Date.now(), sender_id: user.id, receiver_id: selectedDMUser.id, message: newDM, created_at: new Date().toISOString() };
    setDmMessages(prev => [...prev, tempMsg]);
    const messageToSend = newDM;
    setNewDM('');
    const { error } = await supabase.from('private_messages').insert([{ sender_id: user.id, receiver_id: selectedDMUser.id, message: messageToSend }]);
    if (error) alert("Mesaj gönderilemedi: " + error.message);
  };

  const fetchAllProfiles = async () => {
    const { data, error } = await supabase.from('profiles').select('*').order('full_name', { ascending: true });
    if (data) setAllProfiles(data);
  };

  // Battle Logic
  const inviteToBattle = async (opponent) => {
    const { data } = await supabase.from('battles').insert([{
      inviter_id: user.id, invitee_id: opponent.id,
      inviter_name: user.user_metadata.full_name, invitee_name: opponent.full_name,
      status: 'pending'
    }]).select().single();
    if (data) { setActiveBattle(data); alert("Davet gönderildi, bekleniyor..."); }
  };

  const acceptBattle = async (battleId) => { await supabase.from('battles').update({ status: 'active' }).eq('id', battleId); };
  const declineBattle = async (battleId) => { await supabase.from('battles').update({ status: 'declined' }).eq('id', battleId); };

  const startBattleMode = (battle) => {
    const shuffled = [...initialQuestions].sort(() => Math.random() - 0.5).slice(0, 10);
    setQuestions(shuffled); setCurrentIdx(0); setScore(0); setAnswered(false); setSelected(null);
    setBattleTimeLeft(60); setPage('battle-arena');
  };

  useEffect(() => {
    let timer;
    if (page === 'battle-arena' && battleTimeLeft > 0 && activeBattle?.status === 'active') {
      timer = setTimeout(() => setBattleTimeLeft(prev => prev - 1), 1000);
    } else if (page === 'battle-arena' && battleTimeLeft === 0 && activeBattle?.status === 'active') {
      finishBattle();
    }
    return () => clearTimeout(timer);
  }, [battleTimeLeft, page, activeBattle]);

  const handleBattleAnswer = async (opt) => {
    if (answered) return;
    setSelected(opt); setAnswered(true);
    let newScore = score;
    if (opt === questions[currentIdx].answer) {
      newScore += 10; setScore(newScore);
      const isInviter = activeBattle.inviter_id === user.id;
      const updatePayload = isInviter ? { inviter_score: newScore } : { invitee_score: newScore };
      await supabase.from('battles').update(updatePayload).eq('id', activeBattle.id);
    }
    setTimeout(() => {
      if (currentIdx < questions.length - 1) { setCurrentIdx(currentIdx + 1); setAnswered(false); setSelected(null); } 
      else finishBattle();
    }, 1000);
  };

  const finishBattle = async () => {
    await supabase.from('battles').update({ status: 'finished' }).eq('id', activeBattle.id);
    setPage('battle-result');
  };

  // Normal Quiz Logic
  const saveScore = async (finalScore) => {
    if (!user) return;
    const { data: existing } = await supabase.from('scores').select('id, score').eq('user_id', user.id).single();
    if (existing) await supabase.from('scores').update({ score: existing.score + finalScore }).eq('id', existing.id);
    else await supabase.from('scores').insert([{ user_id: user.id, user_name: user.user_metadata.full_name, avatar_url: user.user_metadata.avatar_url, score: finalScore }]);
  };

  const fetchLeaderboard = async () => {
    const { data } = await supabase.from('scores').select('*').order('score', { ascending: false }).limit(20);
    if (data) setLeaderboardData(data);
  };

  const fetchStudentStats = async () => {
    if (!user) return;
    const { data } = await supabase.from('scores').select('score').eq('user_id', user.id).single();
    setStudentStats(data || { score: 0 });
  };

  const updateRole = async (userId, newRole) => {
    await supabase.from('profiles').update({ role: newRole }).eq('id', userId);
    fetchAllProfiles();
  };

  const handleStartQuiz = () => {
    let filtered = initialQuestions;
    if (selectedTopic !== 'Hepsi') filtered = filtered.filter(q => q.title === selectedTopic);
    if (selectedDifficulty !== 'Hepsi') filtered = filtered.filter(q => q.difficulty === selectedDifficulty);
    const shuffled = [...filtered].sort(() => Math.random() - 0.5);
    if (shuffled.length === 0) { alert("Soru bulunamadı!"); return; }
    setQuestions(shuffled); setCurrentIdx(0); setScore(0); setAnswered(false); setSelected(null);
    setPage('quiz');
  };

  const handleAnswer = (opt) => {
    if (answered) return;
    setSelected(opt); setAnswered(true);
    if (opt === questions[currentIdx].answer) setScore(score + 1);
  };

  const nextQuestion = () => {
    if (currentIdx < questions.length - 1) { setCurrentIdx(currentIdx + 1); setAnswered(false); setSelected(null); } 
    else { saveScore(score * 10); setPage('result'); }
  };

  const navigate = (p) => {
    if (p === 'leaderboard') fetchLeaderboard();
    if (p === 'student-panel') fetchStudentStats();
    if (p === 'admin-panel' || p === 'chat') fetchAllProfiles();
    setPage(p);
  };

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      <Header user={user} profile={profile} onNavigate={navigate} />
      
      <AnimatePresence mode="wait">
        {page === 'landing' && (
          <motion.main key="landing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
            <section className="hero">
              <span className="hero-tag">Matematiği eğlenerek çöz</span>
              <h1 className="hero-title">Matematik Portalı.</h1>
              <p className="hero-subtitle">İstediğin konuyu seç, rakiplerinle kapış ve liderlik tablosunda zirveye tırman.</p>
              <div className="btn-container">
                <button className="btn-apple btn-primary" onClick={() => navigate('topic')}>Hemen Başla</button>
                <button className="btn-apple btn-secondary" onClick={() => navigate('chat')}>Sohbet & Kapışma</button>
              </div>
            </section>
          </motion.main>
        )}

        {page === 'profile' && (
           <motion.section key="profile" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section">
             <div className="container" style={{ maxWidth: '400px' }}>
               <div className="card" style={{ textAlign: 'center' }}>
                 {user ? (
                   <>
                     <img src={user.user_metadata.avatar_url} alt="Avatar" style={{ width: '100px', height: '100px', borderRadius: '50%', marginBottom: '20px' }} />
                     <h2 className="question-title">{user.user_metadata.full_name}</h2>
                     <p style={{ color: '#86868b', marginBottom: '10px' }}>{user.email}</p>
                     <p style={{ fontWeight: 600, color: 'var(--accent)', marginBottom: '30px' }}>Rol: {profile?.role === 'teacher' ? 'Öğretmen' : (profile?.role === 'admin' ? 'Yönetici' : 'Öğrenci')}</p>
                     <button className="btn-apple btn-secondary" onClick={handleLogout} style={{ color: '#ff3b30', width: '100%' }}><LogOut size={18} style={{ marginRight: '8px' }} /> Çıkış Yap</button>
                   </>
                 ) : (
                   <>
                     <div className="auth-icon-wrapper"><LogIn size={48} color="#0071e3" /></div>
                     <h2 className="question-title">Giriş Yap</h2>
                     <p style={{ color: '#86868b', marginBottom: '30px' }}>Puanlarını kaydetmek ve kapışmalara katılmak için giriş yap.</p>
                     <button className="btn-apple btn-primary" style={{ width: '100%', padding: '16px' }} onClick={handleGoogleLogin}>Google ile Devam Et</button>
                   </>
                 )}
               </div>
             </div>
           </motion.section>
        )}

        {page === 'student-panel' && user && (
          <motion.section key="student-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section">
            <div className="container" style={{ maxWidth: '800px' }}>
              <h2 className="hero-title" style={{ fontSize: '48px', textAlign: 'center', marginBottom: '40px' }}>Öğrenci Paneli.</h2>
              <div className="card" style={{ display: 'flex', gap: '40px', alignItems: 'center' }}>
                <img src={user.user_metadata.avatar_url} style={{ width: '120px', borderRadius: '50%' }} />
                <div>
                  <h3 style={{ fontSize: '24px', marginBottom: '10px' }}>{user.user_metadata.full_name}</h3>
                  <div style={{ display: 'flex', gap: '20px', marginTop: '20px' }}>
                    <div style={{ background: '#f5f5f7', padding: '15px 25px', borderRadius: '12px' }}>
                      <p style={{ color: '#86868b', fontSize: '14px', marginBottom: '5px' }}>Toplam Puan</p>
                      <p style={{ fontSize: '32px', fontWeight: 700, color: 'var(--accent)' }}>{studentStats?.score || 0}</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.section>
        )}

        {page === 'admin-panel' && (profile?.role === 'teacher' || profile?.role === 'admin') && (
           <motion.section key="admin-panel" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section">
             <div className="container">
               <h2 className="hero-title" style={{ fontSize: '48px', textAlign: 'center', marginBottom: '40px' }}>Öğretmen Paneli.</h2>
               <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
                 <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                   <thead style={{ background: '#f5f5f7' }}>
                     <tr><th style={{ padding: '16px 24px' }}>Öğrenci Adı</th><th style={{ padding: '16px 24px' }}>E-posta</th><th style={{ padding: '16px 24px' }}>Rol</th><th style={{ padding: '16px 24px' }}>İşlem</th></tr>
                   </thead>
                   <tbody>
                     {allProfiles.map(p => (
                       <tr key={p.id} style={{ borderBottom: '1px solid var(--border)' }}>
                         <td style={{ padding: '16px 24px', display: 'flex', alignItems: 'center', gap: '12px' }}><img src={p.avatar_url} style={{ width: '32px', borderRadius: '50%' }} /> {p.full_name}</td>
                         <td style={{ padding: '16px 24px', color: '#86868b' }}>{p.email}</td>
                         <td style={{ padding: '16px 24px' }}><span style={{ background: p.role === 'teacher' ? '#fff3e0' : '#e8f5e9', color: p.role === 'teacher' ? '#ff9800' : '#4caf50', padding: '4px 8px', borderRadius: '4px', fontSize: '12px', fontWeight: 600 }}>{p.role === 'teacher' ? 'Öğretmen' : 'Öğrenci'}</span></td>
                         <td style={{ padding: '16px 24px' }}>
                           {p.role !== 'teacher' && <button className="btn-apple btn-secondary" style={{ padding: '6px 12px', fontSize: '12px' }} onClick={() => updateRole(p.id, 'teacher')}>Öğretmen Yap</button>}
                           {p.role === 'teacher' && <button className="btn-apple btn-secondary" style={{ padding: '6px 12px', fontSize: '12px', borderColor: '#f44336', color: '#f44336' }} onClick={() => updateRole(p.id, 'student')}>Öğrenci Yap</button>}
                         </td>
                       </tr>
                     ))}
                   </tbody>
                 </table>
               </div>
             </div>
           </motion.section>
        )}

        {page === 'chat' && (
          <motion.section key="chat" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section">
            <div className="container" style={{ maxWidth: '1000px', display: 'flex', gap: '20px', height: '70vh' }}>
              <div className="card" style={{ width: '300px', padding: 0, overflowY: 'auto' }}>
                <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', fontWeight: 600 }}>Öğrenciler ({allProfiles.length - 1})</div>
                <div>
                  {allProfiles.filter(p => p.id !== user?.id).map(p => (
                    <div key={p.id} onClick={() => setSelectedDMUser(p)} style={{ padding: '15px 20px', display: 'flex', alignItems: 'center', gap: '12px', cursor: 'pointer', background: selectedDMUser?.id === p.id ? '#f5f5f7' : 'white', borderBottom: '1px solid #f5f5f7' }}>
                      <img src={p.avatar_url} style={{ width: '40px', borderRadius: '50%' }} />
                      <div style={{ flex: 1, fontWeight: 500, fontSize: '15px' }}>{p.full_name}</div>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card" style={{ flex: 1, padding: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
                {selectedDMUser ? (
                  <>
                    <div style={{ padding: '20px', borderBottom: '1px solid var(--border)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                        <img src={selectedDMUser.avatar_url} style={{ width: '40px', borderRadius: '50%' }} />
                        <span style={{ fontWeight: 600 }}>{selectedDMUser.full_name}</span>
                      </div>
                      <button className="btn-apple btn-primary" style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '8px 16px', background: '#ff3b30' }} onClick={() => inviteToBattle(selectedDMUser)}><Swords size={18} /> Kapışmaya Davet Et</button>
                    </div>
                    <div style={{ flex: 1, overflowY: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px', background: '#fafafa' }}>
                      {dmMessages.map((msg, i) => (
                        <div key={i} style={{ display: 'flex', justifyContent: msg.sender_id === user?.id ? 'flex-end' : 'flex-start' }}>
                          <div style={{ background: msg.sender_id === user?.id ? 'var(--accent)' : 'white', color: msg.sender_id === user?.id ? 'white' : 'var(--text-primary)', padding: '12px 16px', borderRadius: '18px', borderBottomRightRadius: msg.sender_id === user?.id ? '4px' : '18px', borderBottomLeftRadius: msg.sender_id === user?.id ? '18px' : '4px', maxWidth: '70%', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' }}>{msg.message}</div>
                        </div>
                      ))}
                      <div ref={dmEndRef} />
                    </div>
                    <form onSubmit={sendDM} style={{ padding: '20px', background: 'white', borderTop: '1px solid var(--border)', display: 'flex', gap: '10px' }}>
                      <input type="text" placeholder="Mesaj yaz..." value={newDM} onChange={e => setNewDM(e.target.value)} style={{ flex: 1, padding: '14px 20px', borderRadius: '100px', border: '1px solid var(--border)', outline: 'none', fontSize: '15px' }} />
                      <button type="submit" disabled={!newDM.trim()} className="btn-apple btn-primary" style={{ padding: '0 20px', borderRadius: '50%' }}><Send size={18} /></button>
                    </form>
                  </>
                ) : (
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#86868b', flexDirection: 'column', gap: '16px' }}><MessageCircle size={48} opacity={0.3} /><p>Sohbet etmek veya kapışmak için soldan birini seç.</p></div>
                )}
              </div>
            </div>
          </motion.section>
        )}

        {page === 'battle-arena' && activeBattle && (
           <motion.section key="battle-arena" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section" style={{ paddingTop: '40px' }}>
             <div className="container" style={{ maxWidth: '1200px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', background: 'white', padding: '20px 40px', borderRadius: '24px', boxShadow: '0 10px 40px rgba(0,0,0,0.05)', marginBottom: '30px' }}>
                  <div style={{ textAlign: 'center' }}><p style={{ fontWeight: 600, color: '#86868b' }}>{activeBattle.inviter_name}</p><h2 style={{ fontSize: '36px', color: 'var(--accent)' }}>{activeBattle.inviter_score}</h2></div>
                  <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}><Clock size={32} color="#ff3b30" /><h1 style={{ fontSize: '48px', color: '#ff3b30', margin: 0 }}>{battleTimeLeft}</h1></div>
                  <div style={{ textAlign: 'center' }}><p style={{ fontWeight: 600, color: '#86868b' }}>{activeBattle.invitee_name}</p><h2 style={{ fontSize: '36px', color: 'var(--accent)' }}>{activeBattle.invitee_score}</h2></div>
                </div>
                <div className="card" style={{ margin: 0, padding: '40px', textAlign: 'center' }}>
                  {questions.length > 0 && questions[currentIdx] ? (
                    <>
                      <h2 className="question-title" style={{ fontSize: '28px', marginBottom: '30px' }}>{questions[currentIdx].question}</h2>
                      <div className="image-wrapper" style={{ marginBottom: '30px', maxWidth: '600px', margin: '0 auto 30px' }}><img src={questions[currentIdx].image} alt="Soru" style={{ width: '100%', borderRadius: '16px' }} /></div>
                      <div className="option-grid" style={{ gridTemplateColumns: '1fr 1fr', gap: '16px', maxWidth: '800px', margin: '0 auto' }}>
                        {questions[currentIdx].options.map((opt, i) => (
                          <div key={i} className={`option-box ${answered ? (opt === questions[currentIdx].answer ? 'correct' : (selected === opt ? 'wrong' : '')) : ''}`} style={{ padding: '20px', fontSize: '18px' }} onClick={() => handleBattleAnswer(opt)}>
                            <span style={{ marginRight: '10px', opacity: 0.4, fontWeight: 700 }}>{String.fromCharCode(65 + i)}</span> {opt}
                          </div>
                        ))}
                      </div>
                    </>
                  ) : <h2>Sorular yükleniyor...</h2>}
                </div>
             </div>
           </motion.section>
        )}

        {page === 'battle-result' && activeBattle && (
           <motion.section key="battle-result" initial={{ opacity: 0, scale: 0.9 }} animate={{ opacity: 1, scale: 1 }} className="quiz-section" style={{ textAlign: 'center' }}>
              <div className="container" style={{ maxWidth: '600px' }}><div className="card" style={{ padding: '60px 40px' }}><Swords size={64} color="var(--accent)" style={{ margin: '0 auto 20px' }} /><h2 style={{ fontSize: '48px', marginBottom: '10px' }}>Kapışma Bitti!</h2><div style={{ display: 'flex', justifyContent: 'space-around', margin: '40px 0', alignItems: 'center' }}><div><h3 style={{ color: '#86868b' }}>{activeBattle.inviter_name}</h3><p style={{ fontSize: '48px', fontWeight: 800 }}>{activeBattle.inviter_score}</p></div><div style={{ fontSize: '24px', fontWeight: 800, color: '#e5e5ea' }}>VS</div><div><h3 style={{ color: '#86868b' }}>{activeBattle.invitee_name}</h3><p style={{ fontSize: '48px', fontWeight: 800 }}>{activeBattle.invitee_score}</p></div></div><button className="btn-apple btn-primary" style={{ width: '100%', padding: '16px' }} onClick={() => { setActiveBattle(null); navigate('chat'); }}>Sohbete Dön</button></div></div>
           </motion.section>
        )}

        {page === 'leaderboard' && (
          <motion.section key="leaderboard" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="quiz-section">
            <div className="container" style={{ maxWidth: '800px' }}>
              <h2 className="hero-title" style={{ fontSize: '48px', textAlign: 'center', marginBottom: '40px' }}>Genel Sıralama.</h2>
              <div className="card" style={{ padding: '0' }}><div className="lb-list">{leaderboardData.map((item, i) => (<div key={i} className="lb-item"><div className="lb-rank">{i + 1}</div><img src={item.avatar_url} alt="Avatar" className="lb-avatar" /><div className="lb-name">{item.user_name}</div><div className="lb-score">{item.score} <span style={{ fontSize: '12px', fontWeight: 400 }}>puan</span></div></div>))}</div></div>
            </div>
          </motion.section>
        )}

        {page === 'topic' && (
          <motion.section key="topic" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="quiz-section">
            <div className="container" style={{ maxWidth: '800px', textAlign: 'center' }}><h2 className="hero-title" style={{ fontSize: '48px', marginBottom: '40px' }}>Konu Seç.</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>{topics.map(t => (<div key={t} className={`option-box ${selectedTopic === t ? 'correct' : ''}`} style={{ textAlign: 'center', padding: '24px', fontSize: '18px' }} onClick={() => { setSelectedTopic(t); navigate('difficulty'); }}><BookOpen size={20} style={{ marginBottom: '8px', opacity: 0.5 }} /><div style={{ fontWeight: 600 }}>{t}</div></div>))}</div><button className="btn-apple btn-secondary" style={{ marginTop: '40px' }} onClick={() => navigate('landing')}><ArrowLeft size={16} /> Geri Dön</button></div>
          </motion.section>
        )}

        {page === 'difficulty' && (
          <motion.section key="difficulty" initial={{ opacity: 0, x: 20 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -20 }} className="quiz-section">
            <div className="container" style={{ maxWidth: '800px', textAlign: 'center' }}><h2 className="hero-title" style={{ fontSize: '48px', marginBottom: '40px' }}>Zorluk Seç.</h2><div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>{difficulties.map(d => (<div key={d} className={`option-box ${selectedDifficulty === d ? 'correct' : ''}`} style={{ textAlign: 'center', padding: '24px', fontSize: '18px' }} onClick={() => setSelectedDifficulty(d)}><Zap size={20} style={{ marginBottom: '8px', opacity: 0.5 }} /><div style={{ fontWeight: 600 }}>{d}</div></div>))}</div><div className="btn-container" style={{ marginTop: '40px' }}><button className="btn-apple btn-secondary" onClick={() => navigate('topic')}><ArrowLeft size={16} /> Geri Dön</button><button className="btn-apple btn-primary" onClick={handleStartQuiz}>Testi Başlat</button></div></div>
          </motion.section>
        )}

        {page === 'quiz' && (
          <motion.section key="quiz" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="quiz-section" style={{ paddingTop: '80px' }}>
            <div className="container" style={{ maxWidth: '1400px' }}>
              {questions.length > 0 && questions[currentIdx] ? (
                <div className="quiz-grid">
                  <div className="question-sidebar">
                    <div className="card" style={{ margin: 0, padding: '30px' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}><div style={{ color: '#86868b', fontSize: '12px', fontWeight: 600 }}>Soru {currentIdx + 1} / {questions.length}</div><div style={{ fontSize: '11px', fontWeight: 700, padding: '2px 8px', borderRadius: '100px', backgroundColor: questions[currentIdx].difficulty === 'Zor' ? '#ffebee' : '#e8f5e9', color: questions[currentIdx].difficulty === 'Zor' ? '#f44336' : '#4caf50' }}>{questions[currentIdx].difficulty}</div></div>
                      <h2 className="question-title" style={{ fontSize: '24px', marginBottom: '20px' }}>{questions[currentIdx].question}</h2>
                      <div className="image-wrapper" style={{ marginBottom: '24px' }}><img src={questions[currentIdx].image} alt="Soru" style={{ width: '100%', height: 'auto', display: 'block' }} /></div>
                      <div className="option-grid" style={{ gridTemplateColumns: '1fr', gap: '10px' }}>{questions[currentIdx].options.map((opt, i) => (<div key={i} className={`option-box ${answered ? (opt === questions[currentIdx].answer ? 'correct' : (selected === opt ? 'wrong' : '')) : ''}`} style={{ padding: '15px' }} onClick={() => handleAnswer(opt)}><span style={{ marginRight: '10px', opacity: 0.4, fontWeight: 700 }}>{String.fromCharCode(65 + i)}</span> {opt}</div>))}</div>
                      <AnimatePresence>{answered && (<motion.div initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: 'auto' }} style={{ marginTop: '20px', padding: '15px', borderRadius: '12px', background: '#f5f5f7' }}><div style={{ fontWeight: 600, marginBottom: '5px', color: selected === questions[currentIdx].answer ? '#4caf50' : '#f44336' }}>{selected === questions[currentIdx].answer ? 'Doğru!' : 'Yanlış.'}</div><p style={{ color: '#86868b', fontSize: '13px' }}>{questions[currentIdx].explanation}</p><button className="btn-apple btn-primary" style={{ marginTop: '15px', width: '100%' }} onClick={nextQuestion}>{currentIdx < questions.length - 1 ? 'Sıradaki Soru' : 'Sonuçlar'}</button></motion.div>)}</AnimatePresence>
                    </div>
                  </div>
                  <div className="whiteboard-area"><CanvasBoard key={currentIdx} /></div>
                </div>
              ) : (
                <div className="card" style={{ textAlign: 'center', padding: '100px' }}><h2>Sorular Hazırlanıyor...</h2><p>Lütfen bekleyin, testiniz oluşturuluyor.</p></div>
              )}
            </div>
          </motion.section>
        )}

        {page === 'result' && (
          <motion.section key="result" initial={{ opacity: 0, scale: 0.95 }} animate={{ opacity: 1, scale: 1 }} className="quiz-section" style={{ textAlign: 'center' }}>
            <div className="container"><div className="card"><h2 className="question-title" style={{ fontSize: '48px' }}>Tebrikler!</h2><p style={{ fontSize: '80px', fontWeight: 800, margin: '10px 0', color: '#0071e3' }}>{score * 10}</p><p style={{ fontSize: '21px', color: '#86868b', marginBottom: '40px' }}>Puanın genel sıralamaya eklendi!</p><div className="btn-container" style={{ flexDirection: 'column', gap: '10px' }}><button className="btn-apple btn-primary" style={{ width: '100%' }} onClick={() => navigate('topic')}>Yeni Teste Başla</button><button className="btn-apple btn-secondary" style={{ width: '100%' }} onClick={() => navigate('leaderboard')}>Sıralamayı Gör</button></div></div></div>
          </motion.section>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
