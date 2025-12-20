'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/AuthContext';
import { db } from '@/lib/firebase';
import { collection, query, where, orderBy, getDocs, addDoc, updateDoc, doc } from 'firebase/firestore';
import ProtectedRoute from '@/components/ProtectedRoute';

interface Trade {
  id: string;
  symbol: string;
  side: string;
  entryPrice: number;
  closePrice: number;
  lots: number;
  pnl: number;
  openedAt: any;
  closedAt: any;
  note?: string;
}

export default function AnalyticsPage() {
  return (
    <ProtectedRoute>
      <AnalyticsContent />
    </ProtectedRoute>
  );
}

function AnalyticsContent() {
  const { user } = useAuth();
  const [trades, setTrades] = useState<Trade[]>([]);
  const [selectedTrade, setSelectedTrade] = useState<Trade | null>(null);
  const [note, setNote] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    loadTrades();
  }, [user]);

  const loadTrades = async () => {
    if (!user) return;

    try {
      const q = query(
        collection(db, 'trades'),
        where('userId', '==', user.uid),
        where('status', '==', 'closed'),
        orderBy('closedAt', 'desc')
      );

      const snapshot = await getDocs(q);
      const tradesData = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      } as Trade));

      setTrades(tradesData);
    } catch (error) {
      console.error('Error loading trades:', error);
    } finally {
      setLoading(false);
    }
  };

  const saveNote = async () => {
    if (!selectedTrade || !note.trim()) return;

    try {
      await updateDoc(doc(db, 'trades', selectedTrade.id), {
        note: note.trim()
      });

      await loadTrades();
      setSelectedTrade(null);
      setNote('');
      alert('✅ Note sauvegardée');
    } catch (error) {
      console.error('Error saving note:', error);
      alert('❌ Erreur sauvegarde note');
    }
  };

  const openNoteModal = (trade: Trade) => {
    setSelectedTrade(trade);
    setNote(trade.note || '');
  };

  if (loading) {
    return <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-gray-600">Chargement...</div>
    </div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-8">📊 Analytique & Journal de Trading</h1>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Journal de trading */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">📝 Journal de Trading</h2>

            {trades.length === 0 ? (
              <p className="text-gray-500 text-center py-8">Aucun trade fermé</p>
            ) : (
              <div className="space-y-3">
                {trades.map(trade => (
                  <div
                    key={trade.id}
                    className="border border-gray-200 rounded-lg p-4 hover:border-blue-300 transition cursor-pointer"
                    onClick={() => openNoteModal(trade)}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <span className="text-lg font-semibold">{trade.symbol}</span>
                        <span className={`px-2 py-1 rounded text-sm font-medium ${
                          trade.side === 'BUY' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                        }`}>
                          {trade.side}
                        </span>
                        <span className="text-sm text-gray-500">
                          {trade.lots} lot{trade.lots > 1 ? 's' : ''}
                        </span>
                      </div>
                      <span className={`font-bold ${trade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {trade.pnl >= 0 ? '+' : ''}{trade.pnl.toFixed(2)} USD
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-sm text-gray-600">
                      <div>
                        Entry: {trade.entryPrice?.toFixed(5) || 'N/A'} → Close: {trade.closePrice?.toFixed(5) || 'N/A'}
                      </div>
                      <div>
                        {trade.closedAt?.toDate ? new Date(trade.closedAt.toDate()).toLocaleDateString('fr-FR') : 'N/A'}
                      </div>
                    </div>

                    {trade.note && (
                      <div className="mt-2 p-2 bg-blue-50 rounded text-sm text-gray-700 border-l-4 border-blue-400">
                        📝 {trade.note}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Calendrier simple */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold text-gray-800 mb-4">📅 Calendrier</h2>

            <div className="mb-4">
              <div className="text-center mb-2">
                <div className="text-2xl font-bold text-gray-900">
                  {new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
                </div>
              </div>

              <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-gray-500 mb-2">
                <div>L</div>
                <div>M</div>
                <div>M</div>
                <div>J</div>
                <div>V</div>
                <div>S</div>
                <div>D</div>
              </div>

              <div className="grid grid-cols-7 gap-1">
                {Array.from({ length: 35 }).map((_, i) => {
                  const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay();
                  const day = i - (firstDay === 0 ? 6 : firstDay - 1) + 1;
                  const daysInMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0).getDate();
                  const isValidDay = day > 0 && day <= daysInMonth;
                  const isToday = day === new Date().getDate();

                  return (
                    <div
                      key={i}
                      className={`aspect-square flex items-center justify-center text-sm rounded ${
                        !isValidDay ? 'text-gray-300' :
                        isToday ? 'bg-blue-500 text-white font-bold' :
                        'text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      {isValidDay ? day : ''}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="mt-6 p-4 bg-yellow-50 rounded-lg border border-yellow-200">
              <div className="text-sm font-medium text-yellow-800 mb-2">💡 Prochainement :</div>
              <ul className="text-xs text-yellow-700 space-y-1">
                <li>• News économiques</li>
                <li>• Alertes événements</li>
                <li>• Statistiques mensuelles</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Modal pour ajouter/modifier une note */}
      {selectedTrade && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-lg max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xl font-semibold">
                📝 Note pour {selectedTrade.symbol} ({selectedTrade.side})
              </h3>
              <button
                onClick={() => setSelectedTrade(null)}
                className="text-gray-400 hover:text-gray-600 text-2xl"
              >
                ×
              </button>
            </div>

            <div className="mb-4 p-4 bg-gray-50 rounded">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-gray-600">Entry:</span>{' '}
                  <span className="font-semibold">{selectedTrade.entryPrice?.toFixed(5)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Close:</span>{' '}
                  <span className="font-semibold">{selectedTrade.closePrice?.toFixed(5)}</span>
                </div>
                <div>
                  <span className="text-gray-600">Lots:</span>{' '}
                  <span className="font-semibold">{selectedTrade.lots}</span>
                </div>
                <div>
                  <span className="text-gray-600">P&L:</span>{' '}
                  <span className={`font-semibold ${selectedTrade.pnl >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {selectedTrade.pnl >= 0 ? '+' : ''}{selectedTrade.pnl.toFixed(2)} USD
                  </span>
                </div>
              </div>
            </div>

            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Écris ton analyse du trade ici... (stratégie, émotion, leçon apprise, etc.)"
              className="w-full h-40 p-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-none"
            />

            <div className="flex gap-3 mt-4">
              <button
                onClick={saveNote}
                className="flex-1 bg-blue-500 text-white py-2 px-4 rounded-lg hover:bg-blue-600 font-medium transition"
              >
                💾 Sauvegarder
              </button>
              <button
                onClick={() => setSelectedTrade(null)}
                className="px-6 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Annuler
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
