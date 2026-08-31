import React, { useEffect, useState } from 'react';
import { db } from '../lib/firebase';
import { collection, query, orderBy, onSnapshot, getDocs, deleteDoc, doc, writeBatch } from 'firebase/firestore';
import { UserProfile } from '../types';
import { AppErrorLog } from '../services/loggerService';
import { format, subDays, startOfMonth, isAfter } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Shield, Activity, Users, TrendingUp, Terminal, Download, Trash2, ArrowUpDown, ChevronDown, ChevronUp, AlertTriangle } from 'lucide-react';
import { AdminReportList } from './AdminReportList';

export function AdminPanel() {
  const [reports, setReports] = useState<any[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<AppErrorLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'reports' | 'logs' | 'users'>('reports');
  const [expandedLogId, setExpandedLogId] = useState<string | null>(null);

  useEffect(() => {
    // Fetch Reports
    const reportsQuery = query(collection(db, 'spotReports'), orderBy('createdAt', 'desc'));
    const unsubscribeReports = onSnapshot(reportsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));
      setReports(data);
    });

    // Fetch Logs in real-time
    const logsQuery = query(collection(db, 'errorLogs'), orderBy('timestamp', 'desc'));
    const unsubscribeLogs = onSnapshot(logsQuery, (snapshot) => {
      const data = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      })) as AppErrorLog[];
      setLogs(data);
    });

    // Fetch Users for analytics
    const fetchUsers = async () => {
      try {
        const snapshot = await getDocs(collection(db, 'users'));
        const userData = snapshot.docs.map(doc => doc.data() as UserProfile);
        setUsers(userData);
      } catch (error) {
        console.error("Error fetching users:", error);
      } finally {
        setLoading(false);
      }
    };

    fetchUsers();

    return () => {
      unsubscribeReports();
      unsubscribeLogs();
    };
  }, []);

  const stats = {
    totalUsers: users.length,
    activeUsers: users.filter(u => u.lastActiveAt && isAfter(new Date(u.lastActiveAt), subDays(new Date(), 30))).length,
    newThisMonth: users.filter(u => u.createdAt && isAfter(new Date(u.createdAt), startOfMonth(new Date()))).length,
    errorCount: logs.length
  };

  const handleDeleteLog = async (logId: string) => {
    if (!confirm("Weet je zeker dat je dit log wilt verwijderen?")) return;
    try {
      await deleteDoc(doc(db, 'errorLogs', logId));
    } catch (error) {
      console.error("Fout bij verwijderen van log:", error);
      alert("Fout bij verwijderen van log");
    }
  };

  const handleClearAllLogs = async () => {
    if (logs.length === 0) return;
    if (!confirm(`Weet je zeker dat je alle ${logs.length} logs wilt wissen uit de database?`)) return;
    
    try {
      const batch = writeBatch(db);
      logs.forEach(log => {
        if (log.id) {
          batch.delete(doc(db, 'errorLogs', log.id));
        }
      });
      await batch.commit();
    } catch (error) {
      console.error("Fout bij leegmaken van logs:", error);
      alert("Fout bij leegmaken van logs");
    }
  };

  const handleDownloadLogs = () => {
    if (logs.length === 0) return;
    try {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(logs, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `noordzee_surf_advice_error_logs_${format(new Date(), 'yyyy-MM-dd')}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } catch (error) {
      console.error("Error exporting logs:", error);
    }
  };

  const toggleLogExpand = (id: string) => {
    setExpandedLogId(expandedLogId === id ? null : id);
  };

  if (loading) {
    return <div className="p-8 text-center text-slate-500 font-mono text-[11px] uppercase tracking-widest">Laden van Command Center Intelligence...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 glass rounded-xl border border-white/5 gap-4">
        <div className="flex items-center gap-3">
          <Shield className="w-6 h-6 text-accent animate-pulse" />
          <div>
            <h2 className="text-xl font-bold text-white uppercase tracking-tighter">Command Center</h2>
            <p className="text-[10px] font-mono text-accent uppercase tracking-widest">Tactical Oversight Bureau</p>
          </div>
        </div>
        
        {/* Tab Selection */}
        <div className="flex gap-2 bg-slate-950 p-1 rounded-lg border border-white/5">
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-wider transition-all ${
              activeTab === 'reports' ? 'bg-accent/20 text-accent font-bold' : 'text-white/40 hover:text-white'
            }`}
          >
            Field Intelligence
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'users' ? 'bg-emerald-500/20 text-emerald-400 font-bold border border-emerald-500/25' : 'text-white/40 hover:text-white'
            }`}
          >
            <Users className="w-3 h-3" />
            Operatives ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-md font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 ${
              activeTab === 'logs' ? 'bg-red-500/10 text-red-400 font-bold border border-red-500/25' : 'text-white/40 hover:text-white'
            }`}
          >
            Terminal Logs 
            {stats.errorCount > 0 && (
              <span className="bg-red-500 text-white font-sans text-[9px] px-1.5 py-0.5 rounded-full font-bold">
                {stats.errorCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div 
          onClick={() => setActiveTab('users')}
          className="glass p-5 rounded-2xl border border-white/5 relative overflow-hidden group cursor-pointer hover:border-emerald-500/30 transition-all"
        >
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Users className="w-20 h-20 text-white" />
          </div>
          <div className="flex items-center gap-2 mb-3 text-white/40">
            <Users className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono uppercase tracking-widest">Totaal Gebruikers</span>
          </div>
          <div className="text-3xl font-black text-white italic tracking-tighter">
            {stats.totalUsers}
          </div>
          <div className="mt-1 text-[9px] font-mono text-white/20 uppercase tracking-widest">
            Geregistreerde Operatives
          </div>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Activity className="w-20 h-20 text-emerald-400" />
          </div>
          <div className="flex items-center gap-2 mb-3 text-emerald-400/60">
            <Activity className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono uppercase tracking-widest">Actieve Gebruikers</span>
          </div>
          <div className="text-3xl font-black text-white italic tracking-tighter">
            {stats.activeUsers}
          </div>
          <div className="mt-1 text-[9px] font-mono text-emerald-500/40 uppercase tracking-widest">
            30-Dagen Engagement
          </div>
        </div>

        <div className="glass p-5 rounded-2xl border border-white/5 relative overflow-hidden group">
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <TrendingUp className="w-20 h-20 text-accent" />
          </div>
          <div className="flex items-center gap-2 mb-3 text-accent/60">
            <TrendingUp className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono uppercase tracking-widest">Nieuw deze maand</span>
          </div>
          <div className="text-3xl font-black text-white italic tracking-tighter">
            {stats.newThisMonth}
          </div>
          <div className="mt-1 text-[9px] font-mono text-accent/40 uppercase tracking-widest">
            Monthly Inflow Rate
          </div>
        </div>

        {/* Dynamic Log Count Card */}
        <div className={`glass p-5 rounded-2xl border transition-colors ${stats.errorCount > 0 ? 'border-red-500/20 bg-red-950/5' : 'border-white/5'} relative overflow-hidden group`}>
          <div className="absolute -right-4 -bottom-4 opacity-5 group-hover:opacity-10 transition-opacity">
            <Terminal className="w-20 h-20 text-red-400" />
          </div>
          <div className="flex items-center gap-2 mb-3 text-red-400/60">
            <Terminal className="w-3.5 h-3.5" />
            <span className="text-[9px] font-mono uppercase tracking-widest">Systeem Fouten</span>
          </div>
          <div className="text-3xl font-black text-white italic tracking-tighter flex items-center gap-2">
            {stats.errorCount}
            {stats.errorCount > 0 && <AlertTriangle className="w-5 h-5 text-red-500 animate-bounce" />}
          </div>
          <div className="mt-1 text-[9px] font-mono text-red-500/40 uppercase tracking-widest">
            Geregistreerde Logs
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'reports' ? (
        <div className="space-y-4">
          <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30 ml-2">Recent Field Intelligence</h3>
          <AdminReportList />
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">Geregistreerde Operatives ({users.length})</h3>
          </div>

          {users.length === 0 ? (
            <div className="glass p-12 rounded-2xl border border-white/5 text-center text-white/30 flex flex-col items-center justify-center gap-3">
              <Users className="w-10 h-10 text-white/10" />
              <p className="text-xs font-mono uppercase tracking-widest">Geen geregistreerde gebruikers gevonden.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 max-h-[600px] overflow-y-auto pr-1">
              {users.map((u, idx) => {
                const userEmail = u.email || 'Geen e-mail geregistreerd';
                const userName = u.displayName || `Operative #${idx + 1}`;
                const createdDate = u.createdAt ? format(new Date(u.createdAt), 'dd MMM yyyy', { locale: nl }) : 'Onbekend';
                const lastActiveDate = u.lastActiveAt ? format(new Date(u.lastActiveAt), 'dd MMM yyyy, HH:mm', { locale: nl }) : 'Onbekend';

                return (
                  <div key={u.uid || idx} className="glass p-4 rounded-xl border border-white/10 hover:border-white/20 transition-all space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-white flex items-center gap-2">
                          {userName}
                          {u.uid && (
                            <span className="text-[8px] font-mono bg-white/10 px-1.5 py-0.5 rounded text-white/60">
                              {u.uid.slice(0, 6)}...
                            </span>
                          )}
                        </h4>
                        <p className="text-xs font-mono text-emerald-400 font-semibold">{userEmail}</p>
                      </div>
                      <span className="text-[9px] font-mono uppercase px-2 py-0.5 rounded bg-accent/20 text-accent font-bold border border-accent/30">
                        {u.skillLevel || 'intermediate'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/5 text-[10px] font-mono text-white/60">
                      <div>
                        <span className="block text-[8px] text-white/30 uppercase">Gewicht</span>
                        {u.weight ? `${u.weight} kg` : '-'}
                      </div>
                      <div>
                        <span className="block text-[8px] text-white/30 uppercase">Board Setup</span>
                        {u.boards ? `${u.boards.length} craft(s)` : '0'}
                      </div>
                      <div>
                        <span className="block text-[8px] text-white/30 uppercase">Spots</span>
                        {u.savedSpots ? `${u.savedSpots.length} saved` : 'Default'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-white/5 text-[9px] font-mono text-white/40">
                      <span>Lid sinds: {createdDate}</span>
                      <span>Laatst actief: {lastActiveDate}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-2">
            <h3 className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">System Error logboek</h3>
            
            {logs.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 glass bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-400 rounded-lg text-[10px] font-mono uppercase tracking-wider border border-emerald-500/25 transition-all hover:scale-[1.02]"
                >
                  <Download className="w-3.5 h-3.5" /> Exporteer JSON
                </button>
                <button
                  onClick={handleClearAllLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 glass bg-red-500/10 hover:bg-red-500/20 text-red-400 rounded-lg text-[10px] font-mono uppercase tracking-wider border border-red-500/25 transition-all hover:scale-[1.02]"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Wis Logs ({logs.length})
                </button>
              </div>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="glass p-12 rounded-2xl border border-white/5 text-center text-white/30 flex flex-col items-center justify-center gap-3">
              <Terminal className="w-10 h-10 text-white/10" />
              <p className="text-xs font-mono uppercase tracking-widest">Systeemstatus is momenteel 100% stabiel.</p>
              <p className="text-[10px] text-white/20">Geen actuele foutmeldingen of api crashes gedocumenteerd.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const isGeminiError = log.errorType.includes('gemini');
                const isAnalysisError = log.errorType.includes('analysis');
                
                let typeColor = 'text-amber-400 border-amber-500/20 bg-amber-500/5';
                if (isGeminiError) typeColor = 'text-red-400 border-red-500/20 bg-red-500/5';
                if (isAnalysisError) typeColor = 'text-purple-400 border-purple-500/20 bg-purple-500/5';

                return (
                  <div 
                    key={log.id} 
                    className={`rounded-xl border transition-all ${isExpanded ? 'bg-slate-900/80 border-white/10 shadow-lg' : 'glass border-white/5 hover:border-white/10'}`}
                  >
                    {/* Header bar of log */}
                    <div 
                      onClick={() => log.id && toggleLogExpand(log.id)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border ${typeColor}`}>
                          {log.errorType}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-white tracking-tight">{log.message}</p>
                          <p className="text-[10px] font-mono text-white/40 mt-0.5">
                            User: {log.userEmail || 'Anoniem'} • {format(new Date(log.timestamp), 'dd MMM yyyy, HH:mm:ss', { locale: nl })}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3 self-end sm:self-center">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            if (log.id) handleDeleteLog(log.id);
                          }}
                          className="p-1 px-2 text-white/30 hover:text-red-400 hover:bg-red-500/10 rounded transition-colors text-[10px] font-mono flex items-center gap-1"
                          title="Prune log entry"
                        >
                          <Trash2 className="w-3 h-3" /> Wis
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-white/40" /> : <ChevronDown className="w-4 h-4 text-white/40" />}
                      </div>
                    </div>

                    {/* Detailed info expanded */}
                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-white/5 bg-slate-950/50 rounded-b-xl space-y-3 font-mono text-[11px]">
                        {/* Summary of log meta info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-white/40 border-b border-white/5 pb-3">
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-white/20">Log ID</span>
                            <span className="text-white/60 select-all">{log.id}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-white/20">User ID</span>
                            <span className="text-white/60 select-all">{log.userId || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-white/20">Timestamp ISO</span>
                            <span className="text-white/60">{log.timestamp}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-white/20">Category</span>
                            <span className="text-accent underline text-accent/80 hover:text-accent font-bold uppercase">{isGeminiError ? 'Core AI Bureau' : 'Local Platform'}</span>
                          </div>
                        </div>

                        {/* Custom Context properties */}
                        {log.context && Object.keys(log.context).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-white/30 block mb-1">Log Context Map</span>
                            <pre className="bg-slate-950 p-3 rounded-lg border border-white/5 text-amber-300 text-[10px] overflow-x-auto">
                              {JSON.stringify(log.context, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Stack trace section if available */}
                        {log.stack && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-white/30 block mb-1 font-bold text-red-400">Error Stack Trace</span>
                            <pre className="bg-red-950/10 p-3 rounded-lg border border-red-500/10 text-red-300 text-[10px] overflow-x-auto max-h-[250px] overflow-y-auto whitespace-pre-wrap select-text">
                              {log.stack}
                            </pre>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
