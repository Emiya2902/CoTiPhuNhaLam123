/**
 * SHARED GAME LOGIC - works on both server (Node) and client (browser)
 * Wraps the core Monopoly rules into a serializable, authoritative state.
 *
 * This module is loaded by:
 *  - server.js (CommonJS require)
 *  - the browser via a <script> tag (exposes window.GameServer)
 *
 * It reimplements the game rules based on the existing gameCore.js logic
 * but without DOM dependencies, so it can run on the server.
 */

(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  } else {
    root.GameServer = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

// =========================================================
  // SHARED BOARD DATA
  // =========================================================
  let BOARD = [];
  if (typeof window !== 'undefined') {
    // Browser: board.js defines `window.BOARD` (added via a global assignment)
    BOARD = (window.BOARD && window.BOARD.length) ? window.BOARD : BOARD;
  }
  if ((!BOARD || BOARD.length === 0) && typeof self !== 'undefined' && self.BOARD) {
    BOARD = self.BOARD;
  }
  if (!BOARD || BOARD.length === 0) {
    // Node/server: require board.js (it exports BOARD via module.exports)
    try {
      BOARD = require('../board.js');
    } catch (e) {
      BOARD = [];
    }
  }

  const playerColors = ['#ff4757', '#1e90ff', '#2ed573', '#fdcb6e', '#e84393', '#00b894', '#a29bfe', '#ff9f43'];

  // =========================================================
  // CHANCE & FORTUNE CARDS
  // =========================================================
  const chanceCards = [
    { title: "🎁 Trúng Vé Số", action: "MONEY", amount: 150 },
    { title: "💸 Phạt Vi Phạm Giao Thông", action: "MONEY", amount: -50 },
    { title: "🚀 Xe Bỏ Lượt", action: "MOVE_TO", target: 0, getGoBonus: true },
    { title: "🚔 Bị Tống Vào Tù", action: "GO_TO_JAIL" },
    { title: "🚶 Lầm Đường Lạc Lối", action: "MOVE_STEPS", steps: -3 },
    { title: "🎂 Sinh Nhật Bất Ngờ", action: "COLLECT_OTHER", amount: 50 }
  ];
  const fortuneCards = [
    { title: "🏦 Ngân Hàng Hoàn Thuế", action: "MONEY", amount: 100 },
    { title: "🩺 Khám Sức Khỏe", action: "MONEY", amount: -50 },
    { title: "🏨 Lợi Nhuận Bất Động Sản", action: "MONEY", amount: 120 },
    { title: "⚡ Hóa Đơn Điện Nước", action: "MONEY", amount: -40 },
    { title: "🎟️ Trúng Thưởng Hội Chợ", action: "MONEY", amount: 80 }
  ];

  // =========================================================
  // CREATE GAME
  // =========================================================
  function createGame({ playerCount = 2, playerNames = [], settings = {} } = {}) {
const state = {
      board: JSON.parse(JSON.stringify(BOARD)),
      players: [],
      currentPlayerIndex: 0,
      hasRolled: false,
      pendingTile: null,
      pendingCard: null,
      lastRoll: 0,
      logs: [],
      jackpot: 0,
      auctionTile: null,
      auctionState: null,
gameOver: false,
      winner: null
    };

    const s = {
      doubleRentOnFullGroup: settings.doubleRentOnFullGroup !== undefined ? settings.doubleRentOnFullGroup : true,
      mortgageInsteadOfSell: settings.mortgageInsteadOfSell !== undefined ? settings.mortgageInsteadOfSell : true,
      jackpotOnFreeParking: settings.jackpotOnFreeParking !== undefined ? settings.jackpotOnFreeParking : true,
      receiveRentWhileJailed: settings.receiveRentWhileJailed !== undefined ? settings.receiveRentWhileJailed : false,
      auctionMode: settings.auctionMode !== undefined ? settings.auctionMode : false,
      initialMoney: settings.initialMoney || 1500,
      passGoMoney: settings.passGoMoney || 200
    };

    for (let i = 0; i < playerCount; i++) {
      state.players.push({
        id: i + 1,
        name: playerNames[i] || `Người chơi ${i + 1}`,
        color: playerColors[i % playerColors.length],
        position: 0,
        money: s.initialMoney,
        inJail: false,
        jailTurns: 0,
        isBankrupt: false
      });
    }

    state.logs.push('🎮 Trò chơi bắt đầu!');

    return {
      playerColors,
      state,
      settings: s,
exportState,
      getPlayersMeta,
      getCurrentPlayer,
      getCurrentAuctionBidder,
      rollDice,
      action: {
        buyPendingProperty,
        skipPendingProperty,
        applyCardEffect,
        placeBid,
        passBid,
        payBail,
        buildHouse,
        sellHouse,
        mortgageProperty,
        endTurn
      }
    };

    // ---------------- helpers ----------------
    function addLog(msg) { state.logs.push(msg); }

    function getCurrentPlayer() {
      return state.players[state.currentPlayerIndex];
    }

    function getOtherPlayer() {
      return state.players.filter(p => !p.isBankrupt && p.id !== getCurrentPlayer().id)[0]
        || state.players[0];
    }

    function getPlayersMeta() {
      return state.players.map(p => ({ id: p.id, name: p.name, color: p.color }));
    }

function exportState() {
return {
        board: state.board,
        players: state.players,
        currentPlayerIndex: state.currentPlayerIndex,
        hasRolled: state.hasRolled,
        pendingTile: state.pendingTile ? state.pendingTile.id : null,
        pendingCard: state.pendingCard,
        lastRoll: state.lastRoll,
        logs: state.logs.slice(-60),
        jackpot: state.jackpot,
        auctionTile: state.auctionTile ? state.auctionTile.id : null,
        auctionState: state.auctionState,
        gameOver: state.gameOver,
        winner: state.winner,
        settings: s
      };
    }

    // ---------------- ownership & rent ----------------
    function ownsFullGroup(tile) {
      if (!tile || !tile.group) return false;
      const groupTiles = state.board.filter(t => t.group === tile.group);
      return groupTiles.length > 0 && groupTiles.every(t => t.owner === tile.owner);
    }

    function calculateRent(tile, owner) {
      let rent = 0;
      if (tile.type === 'RAILROAD') {
        const owned = state.board.filter(t => t.type === 'RAILROAD' && t.owner === owner.id).length;
        rent = [0, 25, 50, 100, 200][owned] || 0;
      } else if (tile.type === 'UTILITY') {
        const owned = state.board.filter(t => t.type === 'UTILITY' && t.owner === owner.id).length;
        const dice = state.lastRoll || 7;
        rent = owned === 2 ? dice * 10 : dice * 4;
      } else {
        const rents = tile.rent || [Math.round((tile.price || 100) * 0.1)];
        rent = rents[tile.houses || 0] || rents[0] || 0;
        if (s.doubleRentOnFullGroup && !tile.houses && ownsFullGroup(tile)) {
          rent *= 2;
        }
      }
      return rent;
    }

    // ---------------- dice & landing ----------------
    function rollDice() {
      const p = getCurrentPlayer();
      const d1 = Math.floor(Math.random() * 6) + 1;
      const d2 = Math.floor(Math.random() * 6) + 1;
const dice = d1 + d2;
      const isDouble = d1 === d2;
      state.lastRoll = dice;
      state.hasRolled = true;
      const startPos = p.position;

      if (p.inJail) {
        if (isDouble) {
          p.inJail = false; p.jailTurns = 0;
          addLog(`🎲 ${p.name} ra tù miễn phí (đôi ${d1}-${d2}) và đi ${dice} bước!`);
        } else {
          p.jailTurns += 1;
          if (p.jailTurns >= 3) {
            p.money -= 50;
            p.inJail = false; p.jailTurns = 0;
            addLog(`🎲 ${p.name} hết 3 lượt tù -> trừ $50 và đi ${dice} bước!`);
          } else {
            addLog(`🔒 ${p.name} không ra được tù (${p.jailTurns}/3 lượt).`);
            return { action: 'STAY_IN_JAIL', startPos, dice: 0, currentPlayerIndex: state.currentPlayerIndex };
          }
        }
      } else {
        addLog(`🎲 ${p.name} gieo được ${dice} điểm (${d1}+${d2})`);
      }

      const oldPos = p.position;
      p.position = (p.position + dice) % 40;
      if (p.position < oldPos && !p.inJail) {
        p.money += s.passGoMoney;
        addLog(`💵 ${p.name} qua ô Bắt đầu (+$${s.passGoMoney})`);
      }

      return processTileLanding(p, { startPos, dice });
    }

    function processTileLanding(p, info = {}) {
      const tile = state.board[p.position];

      // Go to jail
      if (p.position === 30 || (tile && tile.type === 'GOTO_JAIL')) {
        p.position = 10; p.inJail = true; p.jailTurns = 0;
        addLog(`🚔 ${p.name} bị tống vào ô Tù (#10)!`);
        return { action: 'GO_TO_JAIL', tile, ...info };
      }

      // Chance / Fortune
      const tileName = (tile && tile.name) ? tile.name.toLowerCase() : '';
      const tileType = (tile && tile.type) ? tile.type.toUpperCase() : '';
      const isChance = tileType === 'CHANCE' || tileName.includes('cơ hội');
      const isFortune = tileType === 'FORTUNE' || tileType === 'COMMUNITY' || tileName.includes('khí vận');
      if (isChance || isFortune) {
        const deck = isChance ? chanceCards : fortuneCards;
        const card = deck[Math.floor(Math.random() * deck.length)];
        state.pendingCard = { ...card, type: isChance ? 'CƠ HỘI' : 'KHÍ VẬN' };
        return { action: 'DRAW_CARD', card: state.pendingCard, ...info };
      }

      // Tax
      if (p.position === 4) {
        const tax = Math.round(p.money * 0.10);
        p.money -= tax;
        addLog(`💸 ${p.name} nộp thuế thu nhập $${tax}`);
        return { action: 'PAID_TAX', taxAmount: tax, ...info };
      } else if (p.position === 38) {
        p.money -= 100;
        addLog(`💸 ${p.name} nộp thuế cao cấp $100`);
        return { action: 'PAID_TAX', taxAmount: 100, ...info };
      }

      // Property
      if (tile && tile.price && tile.type !== 'TAX') {
        if (tile.owner === null || tile.owner === undefined) {
          if (p.money >= tile.price) {
            state.pendingTile = tile;
            return { action: 'PROMPT_BUY', tileId: tile.id, ...info };
          } else {
            addLog(`💡 ${p.name} không đủ $${tile.price} để mua [${tile.name}].`);
            if (s.auctionMode) {
              startAuction(tile);
              return { action: 'AUCTION', tileId: tile.id, ...info };
            }
          }
        } else if (tile.owner !== p.id) {
          if (tile.mortgaged) {
            addLog(`🏦 [${tile.name}] đang cầm cố, ${p.name} không phải trả thuê.`);
            return { action: 'END_ROLL', tile, ...info };
          }
          const owner = state.players.find(pl => pl.id === tile.owner);
          if (owner) {
            const rent = calculateRent(tile, owner);
            p.money -= rent;
            owner.money += rent;
            addLog(`💸 ${p.name} trả $${rent} thuê cho ${owner.name}`);
          }
        }
      }

      return { action: 'END_ROLL', tile, ...info };
    }

    // ---------------- auction ----------------
    function startAuction(tile, excludedPlayerId = null) {
      state.auctionTile = tile;
      const bidders = state.players.filter(p => !p.isBankrupt && p.money > 0 && p.id !== excludedPlayerId);
      state.auctionState = {
        currentBid: 0,
        highestBidder: null,
        highestBidderIndex: -1,
        active: true,
        bidders: bidders.map(p => p.id),
        currentBidderIndex: 0,
        passedCount: 0
      };
      const currentIdx = bidders.findIndex(b => b.id === getCurrentPlayer().id);
      if (currentIdx !== -1) {
        state.auctionState.currentBidderIndex = (currentIdx + 1) % bidders.length;
      }
      addLog(`🔨 Đấu giá ô [${tile.name}]! Giá khởi điểm $0.`);
    }

    function getCurrentAuctionBidder() {
      const a = state.auctionState;
      if (!a || !a.active) return null;
      const id = a.bidders[a.currentBidderIndex];
      return state.players.find(p => p.id === id) || null;
    }

    function placeBid(playerIndex, amount) {
      const p = state.players[playerIndex];
      const a = state.auctionState;
      if (!p || !a || !a.active) return false;
      if (getCurrentAuctionBidder()?.id !== p.id) return false;
      if (amount <= a.currentBid) return false;
      if (amount > p.money) return false;
      a.currentBid = amount;
      a.highestBidder = p;
      a.highestBidderIndex = playerIndex;
      addLog(`🔨 ${p.name} đặt giá $${amount}`);
      advanceAuction();
      return true;
    }

    function passBid(playerIndex) {
      const a = state.auctionState;
      if (!a || !a.active) return false;
      const p = state.players[playerIndex];
      if (!p) return false;
      if (getCurrentAuctionBidder()?.id !== p.id) return false;
      a.bidders.splice(a.currentBidderIndex, 1);
      a.passedCount++;
      addLog(`⏭️ ${p.name} bỏ lượt đấu giá.`);
      if (a.bidders.length <= 0) { endAuction(); return true; }
      if (a.currentBidderIndex >= a.bidders.length) a.currentBidderIndex = 0;
      if (a.bidders.length === 1 && a.currentBid > 0) endAuction();
      return true;
    }

    function advanceAuction() {
      const a = state.auctionState;
      if (!a || !a.active) return;
      if (a.bidders.length === 1 && a.currentBid > 0) { endAuction(); return; }
      a.currentBidderIndex = (a.currentBidderIndex + 1) % a.bidders.length;
    }

    function endAuction() {
      const a = state.auctionState;
      const tile = state.auctionTile;
      if (!a || !tile) return null;
      if (a.highestBidder && a.currentBid > 0) {
        a.highestBidder.money -= a.currentBid;
        tile.owner = a.highestBidder.id;
        tile.mortgaged = false;
        addLog(`🏆 ${a.highestBidder.name} thắng đấu giá [${tile.name}] với $${a.currentBid}!`);
      } else {
        addLog(`⭕ Không ai trả giá, [${tile.name}] chưa có chủ.`);
      }
      const result = a.highestBidder ? { winner: a.highestBidder, amount: a.currentBid } : null;
      state.auctionTile = null;
      state.auctionState = null;
      return result;
    }

    // ---------------- card effect ----------------
    function applyCardEffect() {
      const card = state.pendingCard;
      if (!card) return null;
      const p = getCurrentPlayer();

      if (card.action === 'MONEY') {
        p.money += card.amount;
        addLog(`🎴 ${p.name} ${card.amount >= 0 ? '+' : ''}$${card.amount}`);
      } else if (card.action === 'COLLECT_OTHER') {
        const other = getOtherPlayer();
        p.money += card.amount;
        other.money -= card.amount;
        addLog(`🎴 ${p.name} nhận $${card.amount} từ ${other.name}`);
      } else if (card.action === 'GO_TO_JAIL') {
        p.position = 10; p.inJail = true; p.jailTurns = 0;
        addLog(`🎴 ${p.name} bị áp giải vào Tù (#10)!`);
      } else if (card.action === 'MOVE_TO') {
        p.position = card.target;
        if (card.getGoBonus) p.money += 200;
        addLog(`🎴 ${p.name} di chuyển đến ô #${card.target}`);
      } else if (card.action === 'MOVE_STEPS') {
        p.position = (p.position + card.steps + 40) % 40;
        addLog(`🎴 ${p.name} dịch chuyển ${card.steps} bước (ô #${p.position})`);
      }

      const resultCard = { ...card, finalPos: p.position };

      if (card.action === 'MOVE_TO' || card.action === 'MOVE_STEPS') {
        resultCard.landing = processTileLanding(p, { startPos: 0 });
      }

      state.pendingCard = null;
      checkGameOver();
      return resultCard;
    }

    // ---------------- property actions ----------------
    function buyPendingProperty() {
      const p = getCurrentPlayer();
      const tile = state.pendingTile;
      if (tile && p.money >= tile.price) {
        p.money -= tile.price;
        tile.owner = p.id;
        addLog(`🛒 ${p.name} mua [${tile.name}] (-$${tile.price})`);
        state.pendingTile = null;
        return true;
      }
      return false;
    }

    function skipPendingProperty() {
      const p = getCurrentPlayer();
      const tile = state.pendingTile;
      if (tile) {
        addLog(`⏭️ ${p.name} bỏ qua không mua [${tile.name}]`);
        if (s.auctionMode && (tile.owner === null || tile.owner === undefined)) {
          startAuction(tile, p.id);
        }
      }
      state.pendingTile = null;
    }

    function buildHouse(tileId) {
      const p = getCurrentPlayer();
      const tile = state.board.find(t => t.id === tileId);
      if (!tile || tile.owner !== p.id || tile.type !== 'PROPERTY') return false;
      const houses = tile.houses || 0;
      if (houses >= 5) return false;
      const houseCost = tile.housePrice || Math.round((tile.price || 100) * 0.75);
      if (p.money < houseCost) return false;
      p.money -= houseCost;
      tile.houses = houses + 1;
      addLog(`🏠 ${p.name} xây ${tile.houses === 5 ? 'khách sạn' : 'nhà'} tại [${tile.name}]`);
      return true;
    }

    function sellHouse(tileId) {
      const p = getCurrentPlayer();
      const tile = state.board.find(t => t.id === tileId);
      if (!tile || tile.owner !== p.id || tile.type !== 'PROPERTY') return false;
      const houses = tile.houses || 0;
      if (houses <= 0) return false;
      const houseCost = tile.housePrice || Math.round((tile.price || 100) * 0.75);
      const refund = Math.round(houseCost / 2);
      p.money += refund;
      tile.houses = houses - 1;
      addLog(`📉 ${p.name} dỡ 1 nhà tại [${tile.name}] (+$${refund})`);
      return true;
    }

    function mortgageProperty(tileId) {
      const p = getCurrentPlayer();
      const tile = state.board.find(t => t.id === tileId);
      if (!tile || tile.owner !== p.id) return false;
      const value = Math.round((tile.price || 0) / 2);
      if (s.mortgageInsteadOfSell) {
        if (tile.mortgaged) {
          const redeemCost = value + Math.round(value * 0.1);
          if (p.money < redeemCost) return false;
          p.money -= redeemCost;
          tile.mortgaged = false;
          addLog(`🔓 ${p.name} chuộc lại [${tile.name}]`);
          return true;
        }
        p.money += value;
        tile.mortgaged = true;
        addLog(`🏦 ${p.name} cầm cố [${tile.name}] (+$${value})`);
        return true;
      }
      p.money += value;
      tile.owner = null;
      tile.houses = 0;
      tile.mortgaged = false;
      addLog(`🏦 ${p.name} bán hẳn [${tile.name}] (+$${value})`);
      return true;
    }

    function payBail() {
      const p = getCurrentPlayer();
      if (p.inJail && p.money >= 50) {
        p.money -= 50;
        p.inJail = false; p.jailTurns = 0;
        addLog(`🔓 ${p.name} nộp $50 bảo lãnh và ra tù!`);
        return true;
      }
      return false;
    }

    function endTurn() {
      const total = state.players.length;
      let next = state.currentPlayerIndex;
      for (let i = 0; i < total; i++) {
        next = (next + 1) % total;
        if (!state.players[next].isBankrupt) break;
      }
state.currentPlayerIndex = next;
      state.hasRolled = false;
      addLog(`🔄 Chuyển lượt sang ${getCurrentPlayer().name}`);
      checkGameOver();
    }

function checkGameOver() {
      const alive = state.players.filter(p => !p.isBankrupt);
      if (alive.length <= 1) {
        state.gameOver = true;
        state.winner = alive[0] ? alive[0].id : null;
        if (state.winner) addLog(`🏆 ${alive[0].name} chiến thắng!`);
      }
    }
  }

// =========================================================
  // APPLY ACTION (public API for server)
  // =========================================================
  function applyAction(game, playerIdx, action) {
    if (!game || !action) return null;
    const { state } = game;
    const p = state.players[playerIdx];
    if (!p) return null;

    // -------------------------------------------------------
    // TURN VALIDATION (authoritative)
    // Chỉ người chơi đang đến lượt mới được thực hiện các hành động
    // thuộc lượt. Hành động đấu giá kiểm tra người trả giá hiện tại.
    // -------------------------------------------------------
    const isCurrentPlayer = playerIdx === state.currentPlayerIndex;

    // Các hành động chỉ được phép khi đúng lượt của người chơi
    const turnLockedActions = [
      'BUY_PROPERTY', 'SKIP_PROPERTY', 'APPLY_CARD', 'PAY_BAIL',
      'BUILD_HOUSE', 'SELL_HOUSE', 'MORTGAGE', 'END_TURN', 'ROLL_DICE'
    ];
if (turnLockedActions.includes(action.type) && !isCurrentPlayer) {
      return { error: 'NOT_YOUR_TURN' };
    }

    // Chỉ gieo xúc xắc 1 lần duy nhất trong mỗi lượt (chống spam nhiều lượt)
    if (action.type === 'ROLL_DICE' && state.hasRolled) {
      return { error: 'ALREADY_ROLLED' };
    }

    // Phải gieo xúc xắc trước khi kết thúc lượt
    if (action.type === 'END_TURN' && !state.hasRolled) {
      return { error: 'MUST_ROLL_FIRST' };
    }

    // Hành động đấu giá: chỉ người đang đến lượt trả giá mới được đặt/bỏ
    if (action.type === 'PLACE_BID' || action.type === 'PASS_BID') {
      const bidder = game.getCurrentAuctionBidder();
      if (!bidder || bidder.id !== p.id) {
        return { error: 'NOT_YOUR_BID_TURN' };
      }
    }

    switch (action.type) {
      case 'BUY_PROPERTY':
        return game.action.buyPendingProperty();
      case 'SKIP_PROPERTY':
        game.action.skipPendingProperty();
        return true;
      case 'APPLY_CARD':
        return game.action.applyCardEffect();
      case 'PLACE_BID':
        return game.action.placeBid(playerIdx, action.amount);
      case 'PASS_BID':
        return game.action.passBid(playerIdx);
      case 'PAY_BAIL':
        return game.action.payBail();
      case 'BUILD_HOUSE':
        return game.action.buildHouse(action.tileId);
      case 'SELL_HOUSE':
        return game.action.sellHouse(action.tileId);
      case 'MORTGAGE':
        return game.action.mortgageProperty(action.tileId);
      case 'END_TURN':
        game.action.endTurn();
        return true;
      case 'ROLL_DICE':
        return game.rollDice();
      default:
        return null;
    }
  }

  return { createGame, applyAction, playerColors };
});
