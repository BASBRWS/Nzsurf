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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-5 bg-white rounded-2xl border border-slate-200 shadow-sm gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-50 border border-cyan-200 flex items-center justify-center text-cyan-700">
            <Shield className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-black text-slate-900 uppercase tracking-wider font-tactical">Command Center</h2>
            <p className="text-[10px] font-mono text-cyan-700 uppercase tracking-widest font-bold">Tactical Oversight Bureau</p>
          </div>
        </div>
        
        {/* Tab Selection */}
        <div className="flex gap-1.5 bg-slate-100 p-1 rounded-xl border border-slate-200">
          <button
            onClick={() => setActiveTab('reports')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all cursor-pointer font-bold ${
              activeTab === 'reports' ? 'bg-slate-900 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Field Intelligence
          </button>
          <button
            onClick={() => setActiveTab('users')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              activeTab === 'users' ? 'bg-emerald-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            <Users className="w-3 h-3" />
            Operatives ({users.length})
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`px-3 py-1.5 rounded-lg font-mono text-[10px] uppercase tracking-wider transition-all flex items-center gap-1.5 cursor-pointer font-bold ${
              activeTab === 'logs' ? 'bg-rose-600 text-white shadow-xs' : 'text-slate-600 hover:text-slate-900 hover:bg-white/60'
            }`}
          >
            Terminal Logs 
            {stats.errorCount > 0 && (
              <span className="bg-white text-rose-600 font-sans text-[9px] px-1.5 py-0.2 rounded-full font-bold ml-1">
                {stats.errorCount}
              </span>
            )}
          </button>
        </div>
      </div>

      {/* Analytics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <div 
          onClick={() => setActiveTab('users')}
          className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group cursor-pointer hover:border-emerald-500/50 transition-all"
        >
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Users className="w-4 h-4 text-cyan-600" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Totaal Gebruikers</span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {stats.totalUsers}
          </div>
          <div className="mt-1 text-[10px] font-mono text-slate-400 uppercase tracking-wider">
            Geregistreerde Operatives
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Activity className="w-4 h-4 text-emerald-600" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Actieve Gebruikers</span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {stats.activeUsers}
          </div>
          <div className="mt-1 text-[10px] font-mono text-emerald-600 uppercase tracking-wider font-semibold">
            30-Dagen Engagement
          </div>
        </div>

        <div className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm relative overflow-hidden group">
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <TrendingUp className="w-4 h-4 text-blue-600" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Nieuw deze maand</span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight">
            {stats.newThisMonth}
          </div>
          <div className="mt-1 text-[10px] font-mono text-blue-600 uppercase tracking-wider font-semibold">
            Monthly Inflow Rate
          </div>
        </div>

        {/* Dynamic Log Count Card */}
        <div className={`bg-white p-5 rounded-2xl border shadow-sm transition-colors ${stats.errorCount > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-slate-200'} relative overflow-hidden group`}>
          <div className="flex items-center gap-2 mb-2 text-slate-500">
            <Terminal className="w-4 h-4 text-rose-600" />
            <span className="text-[10px] font-mono font-bold uppercase tracking-widest">Systeem Fouten</span>
          </div>
          <div className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-2">
            {stats.errorCount}
            {stats.errorCount > 0 && <AlertTriangle className="w-5 h-5 text-rose-500 animate-bounce" />}
          </div>
          <div className="mt-1 text-[10px] font-mono text-rose-600 uppercase tracking-wider font-semibold">
            Geregistreerde Logs
          </div>
        </div>
      </div>

      {/* Main Tab Content */}
      {activeTab === 'reports' ? (
        <div className="space-y-4">
          <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-500 ml-1">Recent Field Intelligence</h3>
          <AdminReportList />
        </div>
      ) : activeTab === 'users' ? (
        <div className="space-y-4">
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-500">Geregistreerde Operatives ({users.length})</h3>
          </div>

          {users.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-400 flex flex-col items-center justify-center gap-3 shadow-sm">
              <Users className="w-10 h-10 text-slate-300" />
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
                  <div key={u.uid || idx} className="bg-white p-4 rounded-xl border border-slate-200 hover:border-cyan-300 shadow-sm transition-all space-y-3">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <h4 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                          {userName}
                          {u.uid && (
                            <span className="text-[9px] font-mono bg-slate-100 px-1.5 py-0.5 rounded text-slate-500 font-normal">
                              {u.uid.slice(0, 6)}...
                            </span>
                          )}
                        </h4>
                        <p className="text-xs font-mono text-cyan-700 font-semibold">{userEmail}</p>
                      </div>
                      <span className="text-[10px] font-mono uppercase px-2 py-0.5 rounded-md bg-cyan-50 text-cyan-800 font-bold border border-cyan-200">
                        {u.skillLevel || 'intermediate'}
                      </span>
                    </div>

                    <div className="grid grid-cols-3 gap-2 pt-2 border-t border-slate-100 text-[10px] font-mono text-slate-600">
                      <div>
                        <span className="block text-[8px] text-slate-400 uppercase">Gewicht</span>
                        {u.weight ? `${u.weight} kg` : '-'}
                      </div>
                      <div>
                        <span className="block text-[8px] text-slate-400 uppercase">Board Setup</span>
                        {u.boards ? `${u.boards.length} craft(s)` : '0'}
                      </div>
                      <div>
                        <span className="block text-[8px] text-slate-400 uppercase">Spots</span>
                        {u.savedSpots ? `${u.savedSpots.length} saved` : 'Default'}
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[9px] font-mono text-slate-400">
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
          <div className="flex justify-between items-center px-1">
            <h3 className="text-xs font-mono uppercase tracking-widest font-bold text-slate-500">System Error logboek</h3>
            
            {logs.length > 0 && (
              <div className="flex items-center gap-3">
                <button
                  onClick={handleDownloadLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 rounded-lg text-[10px] font-mono uppercase tracking-wider border border-emerald-200 transition-all font-bold cursor-pointer"
                >
                  <Download className="w-3.5 h-3.5" /> Exporteer JSON
                </button>
                <button
                  onClick={handleClearAllLogs}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-lg text-[10px] font-mono uppercase tracking-wider border border-rose-200 transition-all font-bold cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" /> Wis Logs ({logs.length})
                </button>
              </div>
            )}
          </div>

          {logs.length === 0 ? (
            <div className="bg-white p-12 rounded-2xl border border-slate-200 text-center text-slate-500 flex flex-col items-center justify-center gap-3 shadow-sm">
              <Terminal className="w-10 h-10 text-emerald-500" />
              <p className="text-xs font-mono uppercase tracking-widest font-bold text-slate-800">Systeemstatus is momenteel 100% stabiel.</p>
              <p className="text-[11px] text-slate-400">Geen actuele foutmeldingen of api crashes gedocumenteerd.</p>
            </div>
          ) : (
            <div className="space-y-2.5 max-h-[600px] overflow-y-auto pr-1">
              {logs.map((log) => {
                const isExpanded = expandedLogId === log.id;
                const isGeminiError = log.errorType.includes('gemini');
                const isAnalysisError = log.errorType.includes('analysis');
                
                let typeColor = 'text-amber-700 border-amber-200 bg-amber-50';
                if (isGeminiError) typeColor = 'text-rose-700 border-rose-200 bg-rose-50';
                if (isAnalysisError) typeColor = 'text-purple-700 border-purple-200 bg-purple-50';

                return (
                  <div 
                    key={log.id} 
                    className={`rounded-xl border transition-all ${isExpanded ? 'bg-white border-slate-300 shadow-md' : 'bg-white border-slate-200 hover:border-slate-300 shadow-xs'}`}
                  >
                    {/* Header bar of log */}
                    <div 
                      onClick={() => log.id && toggleLogExpand(log.id)}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-4 cursor-pointer gap-2 select-none"
                    >
                      <div className="flex items-center gap-3">
                        <span className={`px-2 py-0.5 rounded text-[9px] font-mono uppercase tracking-wider border font-bold ${typeColor}`}>
                          {log.errorType}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-slate-900 tracking-tight">{log.message}</p>
                          <p className="text-[10px] font-mono text-slate-500 mt-0.5">
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
                          className="p-1 px-2 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded transition-colors text-[10px] font-mono font-bold flex items-center gap-1 cursor-pointer"
                          title="Prune log entry"
                        >
                          <Trash2 className="w-3 h-3" /> Wis
                        </button>
                        {isExpanded ? <ChevronUp className="w-4 h-4 text-slate-500" /> : <ChevronDown className="w-4 h-4 text-slate-500" />}
                      </div>
                    </div>

                    {/* Detailed info expanded */}
                    {isExpanded && (
                      <div className="p-4 pt-0 border-t border-slate-100 bg-slate-50 rounded-b-xl space-y-3 font-mono text-[11px]">
                        {/* Summary of log meta info */}
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-2 text-[10px] text-slate-600 border-b border-slate-200 pb-3 pt-3">
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Log ID</span>
                            <span className="text-slate-800 select-all font-semibold">{log.id}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">User ID</span>
                            <span className="text-slate-800 select-all font-semibold">{log.userId || 'N/A'}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Timestamp ISO</span>
                            <span className="text-slate-800 font-semibold">{log.timestamp}</span>
                          </div>
                          <div>
                            <span className="block text-[8px] uppercase tracking-wider text-slate-400 font-bold">Category</span>
                            <span className="text-cyan-700 font-bold uppercase">{isGeminiError ? 'Core AI Bureau' : 'Local Platform'}</span>
                          </div>
                        </div>

                        {/* Custom Context properties */}
                        {log.context && Object.keys(log.context).length > 0 && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-slate-500 block mb-1 font-bold">Log Context Map</span>
                            <pre className="bg-slate-900 p-3 rounded-lg border border-slate-800 text-amber-300 text-[10px] overflow-x-auto">
                              {JSON.stringify(log.context, null, 2)}
                            </pre>
                          </div>
                        )}

                        {/* Stack trace section if available */}
                        {log.stack && (
                          <div className="space-y-1">
                            <span className="text-[9px] uppercase tracking-wider text-rose-600 block mb-1 font-bold">Error Stack Trace</span>
                            <pre className="bg-rose-950 p-3 rounded-lg border border-rose-800 text-rose-200 text-[10px] overflow-x-auto max-h-[250px] overflow-y-auto whitespace-pre-wrap select-text">
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
