import React, { useEffect, useState } from 'react';
import {
  doc, getDoc, collection, query, where, getDocs, updateDoc, increment,
  addDoc, onSnapshot, runTransaction,
} from 'firebase/firestore';
import { db, auth } from '../firebase';
import {
  ArrowDownCircle, ArrowUpCircle, ArrowLeftRight, Trophy, Video, Lock,
  RotateCcw, Wallet as WalletIcon, X,
} from 'lucide-react';

const POSITIVE_TYPES = ['deposit', 'live_revenue', 'prize_won', 'transfer_received', 'live_reserva_devolvida', 'live_settlement'];
const NEGATIVE_TYPES = ['live_entry', 'withdrawal', 'transfer_sent', 'live_premiada_entrada'];

const TYPE_LABELS = {
  deposit: 'Depósito',
  live_revenue: 'Receita de live',
  prize_won: 'Prêmio',
  transfer_received: 'Transferência recebida',
  live_entry: 'Entrada em live',
  withdrawal: 'Saque',
  transfer_sent: 'Transferência enviada',
  live_premiada_entrada: 'Entrada na própria live (reserva do prêmio)',
  live_reserva_devolvida: 'Devolução da reserva do prêmio',
  live_settlement: 'Repasse da arrecadação da live',
};

const TYPE_ICONS = {
  deposit: ArrowDownCircle,
  live_revenue: Video,
  prize_won: Trophy,
  transfer_received: ArrowDownCircle,
  live_entry: Video,
  withdrawal: ArrowUpCircle,
  transfer_sent: ArrowUpCircle,
  live_premiada_entrada: Lock,
  live_reserva_devolvida: RotateCcw,
  live_settlement: WalletIcon,
};

const FILTERS = [
  { id: 'all', label: 'Todas' },
  { id: 'in', label: 'Entradas' },
  { id: 'out', label: 'Saídas' },
  { id: 'transfer', label: 'Transferências' },
];

const DEPOSIT_AMOUNTS = [10, 50, 100, 500];

export default function Carteira() {
  const uid = auth.currentUser?.uid;
  const [wallet, setWallet] = useState(0);
  const [transactions, setTransactions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeFilter, setActiveFilter] = useState('all');

  const [depositOpen, setDepositOpen] = useState(false);
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const unsubscribe = onSnapshot(
      doc(db, 'users', uid),
      (userDoc) => { if (userDoc.exists()) setWallet(userDoc.data().wallet || 0); },
      (error) => console.error('[Carteira] Erro ao carregar saldo:', error)
    );
    return unsubscribe;
  }, [uid]);

  const loadTransactions = async () => {
    if (!uid) return;
    try {
      const txQuery = query(collection(db, 'transactions'), where('userId', '==', uid));
      const snapshot = await getDocs(txQuery);
      const data = snapshot.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .filter((tx) => tx.visibleInPersonalExtract !== false)
        .sort((a, b) => new Date(b.date) - new Date(a.date));
      setTransactions(data);
    } catch (error) {
      console.error('[Carteira] Erro ao carregar extrato:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTransactions(); }, [uid]);

  const filtered = transactions.filter((tx) => {
    if (activeFilter === 'all') return true;
    if (activeFilter === 'in') return POSITIVE_TYPES.includes(tx.type);
    if (activeFilter === 'out') return NEGATIVE_TYPES.includes(tx.type);
    if (activeFilter === 'transfer') return tx.type === 'transfer_sent' || tx.type === 'transfer_received';
    return true;
  });

  const isPositive = (type) => POSITIVE_TYPES.includes(type);

  return (
    <div>
      <h1 style={styles.title}>Carteira</h1>

      <div style={styles.balanceCard}>
        <p style={styles.balanceLabel}>Saldo disponível</p>
        <h2 style={styles.balanceValue}>R$ {wallet.toFixed(2).replace('.', ',')}</h2>

        <div style={styles.actionsRow}>
          <ActionButton icon={ArrowDownCircle} color="#52fa35" label="Depositar" onClick={() => setDepositOpen(true)} />
          <ActionButton icon={ArrowUpCircle} color="#A020F0" label="Sacar" onClick={() => setWithdrawOpen(true)} />
          <ActionButton icon={ArrowLeftRight} color="#00BFFF" label="Transferir" onClick={() => setTransferOpen(true)} />
        </div>
      </div>

      <h2 style={styles.sectionTitle}>Extrato</h2>

      <div style={styles.filtersRow}>
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setActiveFilter(f.id)}
            style={{ ...styles.filterBtn, ...(activeFilter === f.id ? styles.filterBtnActive : {}) }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p style={styles.emptyText}>Carregando...</p>
      ) : filtered.length === 0 ? (
        <p style={styles.emptyText}>Nenhuma transação.</p>
      ) : (
        <div style={styles.txList}>
          {filtered.map((tx) => {
            const Icon = TYPE_ICONS[tx.type] || WalletIcon;
            const positive = isPositive(tx.type);
            return (
              <div key={tx.id} style={styles.txCard}>
                <div style={{ ...styles.txIconBox, backgroundColor: positive ? 'rgba(82,250,53,0.12)' : 'rgba(255,82,82,0.12)' }}>
                  <Icon size={18} color={positive ? '#52fa35' : '#ff5252'} />
                </div>
                <div style={styles.txInfo}>
                  <p style={styles.txDescription}>{tx.description || TYPE_LABELS[tx.type] || tx.type}</p>
                  <p style={styles.txDate}>
                    {new Date(tx.date).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })}
                  </p>
                </div>
                <span style={{ ...styles.txAmount, color: positive ? '#52fa35' : '#ff5252' }}>
                  {positive ? '+' : '-'} R$ {tx.amount?.toFixed(2).replace('.', ',')}
                </span>
              </div>
            );
          })}
        </div>
      )}

      {depositOpen && (
        <DepositModal
          uid={uid}
          onClose={() => setDepositOpen(false)}
          onDone={loadTransactions}
        />
      )}
      {withdrawOpen && (
        <WithdrawModal
          uid={uid}
          wallet={wallet}
          onClose={() => setWithdrawOpen(false)}
          onDone={loadTransactions}
        />
      )}
      {transferOpen && (
        <TransferModal
          uid={uid}
          wallet={wallet}
          onClose={() => setTransferOpen(false)}
          onDone={loadTransactions}
        />
      )}
    </div>
  );
}

function ActionButton({ icon: Icon, color, label, onClick }) {
  return (
    <button type="button" onClick={onClick} style={styles.actionBtn}>
      <div style={{ ...styles.actionIcon, borderColor: color }}>
        <Icon size={20} color={color} />
      </div>
      <span style={styles.actionLabel}>{label}</span>
    </button>
  );
}

function ModalShell({ title, onClose, children }) {
  return (
    <div style={styles.modalOverlay} onClick={onClose}>
      <div style={styles.modalBox} onClick={(e) => e.stopPropagation()}>
        <div style={styles.modalHeader}>
          <h3 style={styles.modalTitle}>{title}</h3>
          <button type="button" onClick={onClose} style={styles.modalCloseBtn}>
            <X size={20} color="#999" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function DepositModal({ uid, onClose, onDone }) {
  const [processing, setProcessing] = useState(false);

  const handleDeposit = async (amount) => {
    if (processing) return;
    setProcessing(true);
    const operationId = `dep_${uid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    try {
      await runTransaction(db, async (transaction) => {
        const opRef = doc(db, 'wallet_operations', operationId);
        const opSnap = await transaction.get(opRef);
        if (opSnap.exists()) return;
        const userRef = doc(db, 'users', uid);
        const userSnap = await transaction.get(userRef);
        const currentWallet = userSnap.data()?.wallet || 0;
        transaction.set(opRef, { type: 'deposit', userId: uid, amount, createdAt: new Date().toISOString() });
        transaction.update(userRef, { wallet: currentWallet + amount });
      });
      await addDoc(collection(db, 'transactions'), {
        userId: uid, type: 'deposit', description: 'Depósito', amount, date: new Date().toISOString(),
      });
      onDone();
      onClose();
    } catch (error) {
      console.error('[Carteira] Erro no depósito:', error);
      alert('Não foi possível processar o depósito.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ModalShell title="Depositar" onClose={onClose}>
      <p style={styles.modalSubtitle}>Escolha o valor</p>
      {DEPOSIT_AMOUNTS.map((value) => (
        <button
          key={value}
          type="button"
          onClick={() => handleDeposit(value)}
          disabled={processing}
          style={styles.depositOption}
        >
          R$ {value}
        </button>
      ))}
    </ModalShell>
  );
}

function WithdrawModal({ uid, wallet, onClose, onDone }) {
  const [amountText, setAmountText] = useState('');
  const [processing, setProcessing] = useState(false);

  const handleWithdraw = async () => {
    const amount = parseFloat(amountText.replace(',', '.'));
    if (!amount || amount <= 0) { alert('Digite um valor válido'); return; }
    if (amount > wallet) { alert('Saldo insuficiente'); return; }
    if (processing) return;
    setProcessing(true);
    const operationId = `wd_${uid}_${Date.now()}_${Math.floor(Math.random() * 100000)}`;
    try {
      await runTransaction(db, async (transaction) => {
        const opRef = doc(db, 'wallet_operations', operationId);
        const opSnap = await transaction.get(opRef);
        if (opSnap.exists()) return;
        const userRef = doc(db, 'users', uid);
        const userSnap = await transaction.get(userRef);
        const currentWallet = userSnap.data()?.wallet || 0;
        transaction.set(opRef, { type: 'withdrawal', userId: uid, amount, createdAt: new Date().toISOString() });
        transaction.update(userRef, { wallet: currentWallet - amount });
      });
      await addDoc(collection(db, 'transactions'), {
        userId: uid, type: 'withdrawal', description: 'Saque solicitado', amount, date: new Date().toISOString(),
      });
      onDone();
      onClose();
      alert('Saque solicitado! Processado em até 3 dias úteis.');
    } catch (error) {
      console.error('[Carteira] Erro no saque:', error);
      alert('Não foi possível processar o saque.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ModalShell title="Sacar" onClose={onClose}>
      <p style={styles.modalSubtitle}>Saldo disponível: R$ {wallet.toFixed(2).replace('.', ',')}</p>
      <input
        type="text"
        placeholder="Valor do saque"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        style={styles.modalInput}
      />
      <button type="button" onClick={handleWithdraw} disabled={processing} style={styles.confirmBtn}>
        {processing ? 'Processando...' : 'Solicitar Saque'}
      </button>
      <p style={styles.infoText}>Processado em até 3 dias úteis.</p>
    </ModalShell>
  );
}

function TransferModal({ uid, wallet, onClose, onDone }) {
  const [search, setSearch] = useState('');
  const [following, setFollowing] = useState([]);
  const [filteredList, setFilteredList] = useState([]);
  const [target, setTarget] = useState(null);
  const [amountText, setAmountText] = useState('');
  const [processing, setProcessing] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const followsSnap = await getDocs(query(collection(db, 'follows'), where('followerId', '==', uid)));
        const ids = followsSnap.docs.map((d) => d.data().followingId);
        const users = [];
        for (const fid of ids) {
          const userDoc = await getDoc(doc(db, 'users', fid));
          if (userDoc.exists()) users.push({ id: userDoc.id, ...userDoc.data() });
        }
        setFollowing(users);
        setFilteredList(users);
      } catch (error) {
        console.error('[Carteira] Erro ao carregar seguindo:', error);
      }
    })();
  }, [uid]);

  const handleSearchChange = (value) => {
    setSearch(value);
    setTarget(null);
    if (!value.trim()) { setFilteredList(following); return; }
    setFilteredList(
      following.filter(
        (u) => (u.name || '').toLowerCase().includes(value.toLowerCase()) ||
               (u.email || '').toLowerCase().includes(value.toLowerCase())
      )
    );
  };

  const handleTransfer = async () => {
    const amount = parseFloat(amountText.replace(',', '.'));
    if (!target) { alert('Selecione um usuário'); return; }
    if (!amount || amount <= 0) { alert('Digite um valor válido'); return; }
    if (amount > wallet) { alert('Saldo insuficiente'); return; }
    if (!window.confirm(`Enviar R$ ${amount.toFixed(2)} para ${target.name}?`)) return;

    setProcessing(true);
    try {
      const now = new Date().toISOString();
      const myDoc = await getDoc(doc(db, 'users', uid));
      const myName = myDoc.data()?.name || 'Usuário';

      await updateDoc(doc(db, 'users', uid), { wallet: increment(-amount) });
      await updateDoc(doc(db, 'users', target.id), { wallet: increment(amount) });

      await addDoc(collection(db, 'transactions'), {
        userId: uid, type: 'transfer_sent', description: `Transferência para ${target.name}`, amount, date: now,
      });
      await addDoc(collection(db, 'transactions'), {
        userId: target.id, type: 'transfer_received', description: `Transferência de ${myName}`, amount, date: now,
      });
      await addDoc(collection(db, 'notifications'), {
        userId: target.id,
        type: 'transfer',
        message: `te transferiu R$ ${amount.toFixed(2)}`,
        fromUserId: uid,
        fromUserName: myName,
        fromUserPhoto: myDoc.data()?.photoURL || null,
        read: false,
        createdAt: now,
      });

      onDone();
      onClose();
      alert(`Transferência realizada! R$ ${amount.toFixed(2)} enviados para ${target.name}`);
    } catch (error) {
      console.error('[Carteira] Erro na transferência:', error);
      alert('Não foi possível realizar a transferência.');
    } finally {
      setProcessing(false);
    }
  };

  return (
    <ModalShell title="Transferir" onClose={onClose}>
      {target ? (
        <div style={styles.foundUser}>
          <img
            src={target.photoURL || 'https://via.placeholder.com/36'}
            alt={target.name}
            style={styles.foundUserAvatar}
          />
          <span style={styles.foundUserName}>{target.name}</span>
          <button type="button" onClick={() => { setTarget(null); setSearch(''); }} style={styles.foundUserClose}>
            <X size={16} color="#999" />
          </button>
        </div>
      ) : (
        <>
          <input
            type="text"
            placeholder="Buscar por nome ou email..."
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            style={styles.modalInput}
            autoFocus
          />
          {filteredList.length > 0 && (
            <div style={styles.suggestionsList}>
              {filteredList.slice(0, 6).map((u) => (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => { setTarget(u); setSearch(u.name); }}
                  style={styles.suggestionItem}
                >
                  <img src={u.photoURL || 'https://via.placeholder.com/32'} alt={u.name} style={styles.suggestionAvatar} />
                  <div style={{ textAlign: 'left' }}>
                    <p style={styles.suggestionName}>{u.name}</p>
                    <p style={styles.suggestionEmail}>{u.email}</p>
                  </div>
                </button>
              ))}
            </div>
          )}
          {following.length === 0 && <p style={styles.infoText}>Você ainda não segue ninguém.</p>}
        </>
      )}

      <input
        type="text"
        placeholder="Valor (R$)"
        value={amountText}
        onChange={(e) => setAmountText(e.target.value)}
        style={styles.modalInput}
      />

      <button type="button" onClick={handleTransfer} disabled={!target || processing} style={styles.confirmBtn}>
        {processing ? 'Enviando...' : 'Transferir'}
      </button>
    </ModalShell>
  );
}

const styles = {
  title: { fontSize: '28px', fontWeight: 'bold', color: '#fff', margin: 0, marginBottom: '24px' },
  balanceCard: {
    backgroundColor: '#0d0d0d', borderRadius: '16px', padding: '24px',
    border: '1px solid #1a1a1a', maxWidth: '460px', marginBottom: '32px',
  },
  balanceLabel: { color: '#999', fontSize: '13px', margin: 0, marginBottom: '4px' },
  balanceValue: { color: '#fff', fontSize: '34px', fontWeight: '800', margin: 0, marginBottom: '20px' },
  actionsRow: { display: 'flex', justifyContent: 'space-around' },
  actionBtn: { display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px', background: 'none', border: 'none', cursor: 'pointer' },
  actionIcon: {
    width: '48px', height: '48px', borderRadius: '24px', backgroundColor: '#000',
    display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1.5px solid',
  },
  actionLabel: { color: '#ccc', fontSize: '12px', fontWeight: '500' },
  sectionTitle: { fontSize: '18px', fontWeight: '700', color: '#fff', margin: 0, marginBottom: '12px' },
  filtersRow: { display: 'flex', gap: '8px', marginBottom: '20px', flexWrap: 'wrap' },
  filterBtn: {
    padding: '6px 14px', borderRadius: '16px', border: '1px solid #333', backgroundColor: '#111',
    color: '#999', fontSize: '12px', fontWeight: '600', cursor: 'pointer', fontFamily: 'inherit',
  },
  filterBtnActive: { backgroundColor: '#52fa35', borderColor: '#52fa35', color: '#010208' },
  txList: { display: 'flex', flexDirection: 'column', gap: '8px', maxWidth: '560px' },
  txCard: {
    display: 'flex', alignItems: 'center', gap: '12px', backgroundColor: '#0d0d0d',
    borderRadius: '12px', padding: '12px', border: '1px solid #1a1a1a',
  },
  txIconBox: { width: '36px', height: '36px', borderRadius: '18px', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  txInfo: { flex: 1 },
  txDescription: { color: '#f0f0f0', fontSize: '13px', fontWeight: '700', margin: 0, marginBottom: '2px' },
  txDate: { color: '#777', fontSize: '11px', margin: 0 },
  txAmount: { fontSize: '14px', fontWeight: '700' },
  emptyText: { fontSize: '14px', color: '#666' },
  modalOverlay: {
    position: 'fixed', inset: 0, backgroundColor: 'rgba(0,0,0,0.7)',
    display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100,
  },
  modalBox: {
    backgroundColor: '#111', borderRadius: '20px', padding: '24px', width: '380px',
    maxWidth: '90vw', border: '1px solid #222',
  },
  modalHeader: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' },
  modalTitle: { color: '#fff', fontSize: '18px', fontWeight: '800', margin: 0 },
  modalCloseBtn: { background: 'none', border: 'none', cursor: 'pointer', padding: '4px' },
  modalSubtitle: { color: '#999', fontSize: '13px', marginBottom: '16px' },
  modalInput: {
    width: '100%', backgroundColor: '#1a1a1a', borderRadius: '12px', border: '1px solid #333',
    color: '#fff', fontSize: '15px', padding: '12px 14px', marginBottom: '12px', outline: 'none',
    fontFamily: 'inherit', boxSizing: 'border-box',
  },
  depositOption: {
    width: '100%', backgroundColor: '#1a1a1a', borderRadius: '12px', border: '1px solid #333',
    color: '#fff', fontSize: '15px', fontWeight: '600', padding: '14px', marginBottom: '8px',
    cursor: 'pointer', fontFamily: 'inherit', textAlign: 'left',
  },
  confirmBtn: {
    width: '100%', backgroundColor: '#52fa35', borderRadius: '12px', border: 'none',
    color: '#010208', fontSize: '15px', fontWeight: '800', padding: '14px', cursor: 'pointer',
    fontFamily: 'inherit', marginBottom: '8px',
  },
  infoText: { color: '#666', fontSize: '12px', textAlign: 'center' },
  foundUser: {
    display: 'flex', alignItems: 'center', gap: '10px', backgroundColor: 'rgba(82,250,53,0.08)',
    borderRadius: '12px', padding: '10px', border: '1px solid rgba(82,250,53,0.25)', marginBottom: '12px',
  },
  foundUserAvatar: { width: '32px', height: '32px', borderRadius: '50%', objectFit: 'cover' },
  foundUserName: { flex: 1, color: '#fff', fontSize: '14px', fontWeight: '600' },
  foundUserClose: { background: 'none', border: 'none', cursor: 'pointer' },
  suggestionsList: {
    backgroundColor: '#1a1a1a', borderRadius: '12px', border: '1px solid #333',
    marginBottom: '12px', overflow: 'hidden',
  },
  suggestionItem: {
    display: 'flex', alignItems: 'center', gap: '10px', padding: '10px', width: '100%',
    background: 'none', border: 'none', borderBottom: '1px solid #222', cursor: 'pointer', fontFamily: 'inherit',
  },
  suggestionAvatar: { width: '30px', height: '30px', borderRadius: '50%', objectFit: 'cover' },
  suggestionName: { color: '#fff', fontSize: '13px', fontWeight: '600', margin: 0 },
  suggestionEmail: { color: '#777', fontSize: '11px', margin: 0 },
};
