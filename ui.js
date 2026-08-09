/**
 * UI CONTROLLER - Monopoly Richup Sài Gòn
 * Hỗ trợ 2-8 người chơi + màn hình cài đặt luật chơi
 */

document.addEventListener('DOMContentLoaded', () => {
const boardElement = document.getElementById('board');
  const infoCardModal = document.getElementById('property-info-card');
  const buyModal = document.getElementById('buy-modal');
const cardModal = document.getElementById('card-modal');
  const btnAcceptCard = document.getElementById('btn-accept-card');
  const rollBtn = document.getElementById('roll-btn');
  const endTurnBtn = document.getElementById('end-turn-btn');

// AUCTION MODAL
  const auctionModal = document.getElementById('auction-modal');
  const auctionPassBtn = document.getElementById('auction-pass-btn');
  const auctionTimerEl = document.getElementById('auction-timer');
  const auctionHighestToken = document.getElementById('auction-highest-token');
  const auctionAddBtns = document.querySelectorAll('.auction-add-btn');
  let auctionTimerInterval = null;

  const settingsOverlay = document.getElementById('settings-overlay');
  const playerMinus = document.getElementById('player-minus');
  const playerPlus = document.getElementById('player-plus');
  const playerCountVal = document.getElementById('player-count-val');
  const startGameBtn = document.getElementById('start-game-btn');

  let selectedTileIndex = null;
  let playerTokens = []; // Mảng quân cờ (tạo động theo số người chơi)

  // Thêm Nút Bảo Lãnh Ra Tù
  let bailBtn = document.getElementById('bail-btn');
  if (!bailBtn) {
    bailBtn = document.createElement('button');
    bailBtn.id = 'bail-btn';
    bailBtn.className = 'btn hidden';
    bailBtn.style.cssText = `
      background: linear-gradient(135deg, #e67e22, #d35400);
      color: #fff;
      padding: 8px 16px;
      font-size: 13px;
      font-weight: bold;
      border-radius: 8px;
      border: 1px solid #f39c12;
      cursor: pointer;
      display: none;
      margin: 0 auto 12px auto;
      box-shadow: 0 4px 10px rgba(230, 126, 34, 0.4);
    `;
    bailBtn.innerText = '🔓 Nộp $50 ra tù';
    if (rollBtn && rollBtn.parentNode && rollBtn.parentNode.parentNode) {
      rollBtn.parentNode.parentNode.insertBefore(bailBtn, rollBtn.parentNode);
    }
  }

  function getGridPosition(index) {
    if (index >= 0 && index <= 10) return { row: 11, col: 11 - index, side: 'bottom' };
    if (index >= 11 && index <= 20) return { row: 11 - (index - 10), col: 1, side: 'left' };
    if (index >= 21 && index <= 30) return { row: 1, col: 1 + (index - 20), side: 'top' };
    if (index >= 31 && index <= 39) return { row: 1 + (index - 30), col: 11, side: 'right' };
  }

  // Click ra ngoài để tắt pop-up
  document.addEventListener('click', (e) => {
    if (!infoCardModal.contains(e.target) && !e.target.closest('.tile')) {
      infoCardModal.classList.add('hidden');
    }
  });
  infoCardModal.addEventListener('click', (e) => e.stopPropagation());

  // =========================================================
  // DỰNG BÀN CỜ (gọi 1 lần duy nhất sau khi có state)
  // =========================================================
  function buildBoard() {
    // CHỈ xóa các ô cờ cũ, GIỮ LẠI #center-panel (chứa nút Gieo xúc xắc,
    // Kết thúc lượt và các pop-up). Trước đây dùng innerHTML='' đã xóa luôn
    // cả bảng điều khiển trung tâm khiến nút Gieo xúc xắc biến mất.
    boardElement.querySelectorAll('.tile').forEach((t) => t.remove());
    GameCore.state.board.forEach((tile, index) => {
      const tileDiv = document.createElement('div');
      tileDiv.className = 'tile';
      tileDiv.id = `tile-${index}`;

      const pos = getGridPosition(index);
      tileDiv.style.gridRow = pos.row;
      tileDiv.style.gridColumn = pos.col;

      let groupBar = null;
      if (tile.group) {
        groupBar = document.createElement('div');
        groupBar.className = `group-bar group-${tile.group}`;
      }

      const contentDiv = document.createElement('div');
      contentDiv.className = 'tile-content';

      let icon = '';
      if (index === 0) icon = '🚀';
      else if (index === 4) icon = '💸';
      else if (index === 10) icon = '🔒';
      else if (index === 20) icon = '🅿️';
      else if (index === 30) icon = '🚔';
      else if (index === 38) icon = '💎';
      else if (tile.type === "CHANCE") icon = '❓';
      else if (tile.type === "CHEST") icon = '🎁';
      else if (tile.type === "TAX") icon = '💰';

      if (icon) {
        const iconSpan = document.createElement('span');
        iconSpan.className = 'tile-icon';
        iconSpan.innerText = icon;
        contentDiv.appendChild(iconSpan);
      }

      const nameSpan = document.createElement('span');
      nameSpan.className = 'tile-name';
      nameSpan.innerText = tile.name;
      contentDiv.appendChild(nameSpan);

      if (tile.price) {
        const priceSpan = document.createElement('span');
        priceSpan.className = 'tile-price';
        priceSpan.innerText = `$${tile.price}`;
        contentDiv.appendChild(priceSpan);
      }

      if (pos.side === 'bottom') {
        if (groupBar) tileDiv.appendChild(groupBar);
        tileDiv.appendChild(contentDiv);
      } else if (pos.side === 'top') {
        tileDiv.appendChild(contentDiv);
        if (groupBar) tileDiv.appendChild(groupBar);
      } else if (pos.side === 'left') {
        tileDiv.classList.add('side-tile');
        tileDiv.appendChild(contentDiv);
        if (groupBar) tileDiv.appendChild(groupBar);
      } else if (pos.side === 'right') {
        tileDiv.classList.add('side-tile');
        if (groupBar) tileDiv.appendChild(groupBar);
        tileDiv.appendChild(contentDiv);
      }

      tileDiv.addEventListener('click', (e) => {
        e.stopPropagation();
        if (tile.price && tile.type !== "TAX") {
          openPropertyCard(index);
        }
      });

      boardElement.appendChild(tileDiv);
    });
  }

  // =========================================================
  // TẠO QUÂN CỜ & THẺ NGƯỜI CHƠI (động theo số người)
  // =========================================================
  function buildPlayersUI() {
    const players = GameCore.state.players;

// Tạo mảng quân cờ
    playerTokens = players.map((p, i) => {
      const tok = document.createElement('div');
      tok.className = 'player-token';
      tok.dataset.playerId = p.id;
      tok.style.backgroundColor = p.color;
      // Hiển thị emoji nhân vật (quân cờ) mà người chơi đã chọn
      if (p.tokenEmoji) {
        tok.innerText = p.tokenEmoji;
      }
      if (players.length > 4) {
        // Nếu nhiều người -> làm quân cờ nhỏ hơn để tránh chồng lấn
        tok.classList.add('small-token');
      }
      return tok;
    });

    // Dựng danh sách thẻ người chơi bên phải
    const playersList = document.getElementById('players-list');
    playersList.innerHTML = '';
    players.forEach((p, i) => {
      const card = document.createElement('div');
      card.className = 'player-card';
      card.id = `card-p${p.id}`;

      const badge = document.createElement('span');
      badge.className = 'player-badge';
      badge.style.backgroundColor = p.color;

      const name = document.createElement('span');
      name.className = 'player-name';
      name.innerText = p.name;

      const money = document.createElement('span');
      money.className = 'player-money';
      const moneySpan = document.createElement('span');
      moneySpan.id = `p${p.id}-money`;
      moneySpan.innerText = p.money;
      money.appendChild(moneySpan);

      card.appendChild(badge);
      card.appendChild(name);
      card.appendChild(money);
      playersList.appendChild(card);
    });
  }

  // =========================================================
  // CẬP NHẬT GIAO DIỆN (RENDER)
  // =========================================================
  function renderUI() {
    const { players, currentPlayerIndex, board, logs } = GameCore.state;
    const currentPlayer = players[currentPlayerIndex];

    // Cập nhật tiền & trạng thái tù cho từng người chơi
    players.forEach((p) => {
      const moneyEl = document.getElementById(`p${p.id}-money`);
      if (moneyEl) moneyEl.innerText = p.money + (p.inJail ? " 🔒" : "");
      const cardEl = document.getElementById(`card-p${p.id}`);
      if (cardEl) cardEl.classList.toggle('active', p.id === currentPlayer.id);
    });

// Di chuyển quân cờ
    // Gom các người chơi theo vị trí để xếp chồng (stack) khi cùng đứng 1 ô
    const byPosition = {};
    players.forEach((p, i) => {
      if (playerTokens[i]) {
        if (!byPosition[p.position]) byPosition[p.position] = [];
        byPosition[p.position].push(i);
      }
    });

    players.forEach((p, i) => {
      const tileEl = document.getElementById(`tile-${p.position}`);
      if (!tileEl || !playerTokens[i]) return;
      tileEl.appendChild(playerTokens[i]);

      // Xếp chồng quân cờ khi nhiều người cùng đứng trên 1 ô
      const group = byPosition[p.position] || [i];
      const idxInGroup = group.indexOf(i);
      if (group.length > 1) {
        playerTokens[i].classList.add('token-stacked');
        // Xoá các kiểu định vị cũ, sau đó phân bố theo vòng tròn nhỏ quanh ô
        playerTokens[i].style.left = '';
        playerTokens[i].style.right = '';
        playerTokens[i].style.top = '';
        playerTokens[i].style.bottom = '';
        const angle = (idxInGroup / group.length) * 2 * Math.PI;
        const radius = 12;
        const cx = 50;
        const cy = 50;
        playerTokens[i].style.left = `calc(${cx}% + ${Math.cos(angle) * radius}px)`;
        playerTokens[i].style.top = `calc(${cy}% + ${Math.sin(angle) * radius}px)`;
        playerTokens[i].style.transform = 'translate(-50%, -50%)';
      } else {
        playerTokens[i].classList.remove('token-stacked');
        // Khôi phục vị trí góc mặc định theo lớp màu người chơi
        playerTokens[i].style.left = '';
        playerTokens[i].style.right = '';
        playerTokens[i].style.top = '';
        playerTokens[i].style.bottom = '';
        playerTokens[i].style.transform = '';
      }
    });

    // Cập nhật ẩn/hiện nút bảo lãnh ra tù
    if (currentPlayer.inJail && currentPlayer.money >= 50 && !rollBtn.disabled) {
      bailBtn.style.display = 'block';
    } else {
      bailBtn.style.display = 'none';
    }

// Cập nhật ô đất
    board.forEach((tile, index) => {
      updateTileOwnershipUI(index, tile.owner);
      updateTileBadgeUI(index, tile.houses || 0);
      updateTileMortgageUI(index, !!tile.mortgaged);
    });

    updateGroupGlowUI();

    // Cập nhật nhật ký trò chơi và tin nhắn chat.
    const chatBox = document.getElementById('chat-box');
    chatBox.innerHTML = '';
    logs.forEach(msg => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg';
      msgDiv.innerText = msg;
      chatBox.appendChild(msgDiv);
    });
    (GameCore.state.chatMessages || []).forEach(({ from, text }) => {
      const msgDiv = document.createElement('div');
      msgDiv.className = 'chat-msg';
      msgDiv.innerText = `${from}: ${text}`;
      chatBox.appendChild(msgDiv);
    });
    chatBox.scrollTop = chatBox.scrollHeight;

    renderInventory();
    renderTradeBox();
  }

  function renderInventory() {
    const inventoryBox = document.getElementById('inventory-box');
    if (!inventoryBox) return;

    const playerIndex = window.GameOnline && GameOnline.isOnline()
      ? GameOnline.myIndex
      : GameCore.state.currentPlayerIndex;
    const player = GameCore.state.players[playerIndex];
    const properties = player
     ? GameCore.state.board
         .map((tile, index) => ({ tile, index }))
         .filter(({ tile }) => tile.owner === player.id)
     : [];
 
    inventoryBox.innerHTML = '';
    if (!properties.length) {
      const empty = document.createElement('div');
      empty.className = 'inventory-empty';
      empty.innerText = 'Chưa có tài sản.';
      inventoryBox.appendChild(empty);
      return;
    }
 
    properties.forEach(({ tile, index }) => {
      const item = document.createElement('div');
      item.className = 'inventory-item';
      if (tradeState.selectedOfferTiles.includes(index)) {
        item.classList.add('selected');
      }
      item.dataset.tileIndex = String(index);
      item.addEventListener('click', () => {
        toggleTradeTile(index, 'selectedOfferTiles');
      });
 
      const name = document.createElement('div');
      name.className = 'inventory-item-name';
      name.innerText = tile.name;
      const meta = document.createElement('div');
      meta.className = 'inventory-item-meta';
      const buildings = tile.houses ? ` • ${tile.houses === 5 ? 'Khách sạn' : `${tile.houses} nhà`}` : '';
      meta.innerText = `${tile.type}${tile.mortgaged ? ' • Đang cầm cố' : ''}${buildings}`;
      item.append(name, meta);
      inventoryBox.appendChild(item);
    });
  }
 
  let tradeState = {
    targetPlayerId: null,
    offerCash: 0,
    requestCash: 0,
    selectedOfferTiles: [],
    selectedRequestTiles: []
  };
 
  function getCurrentPlayer() {
    return GameCore.state.players[GameCore.state.currentPlayerIndex];
  }

  function getLocalPlayerIndex() {
    return window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()
      ? window.GameOnline.myIndex
      : GameCore.state.currentPlayerIndex;
  }

  function getLocalPlayer() {
    return GameCore.state.players[getLocalPlayerIndex()];
  }

  function getOtherPlayers() {
    const localIndex = getLocalPlayerIndex();
    return GameCore.state.players.filter((p, index) => index !== localIndex);
  }

  function getPlayerById(id) {
    return GameCore.state.players.find((p) => p.id === id);
  }
 
  function clampTradeValue(value, max) {
    const number = parseInt(value, 10);
    if (Number.isNaN(number) || number < 0) return 0;
    return Math.min(number, max);
  }
 
  function toggleTradeTile(tileIndex, listKey) {
    const selectedList = tradeState[listKey];
    const existingIndex = selectedList.indexOf(tileIndex);
    if (existingIndex >= 0) {
      selectedList.splice(existingIndex, 1);
    } else {
      selectedList.push(tileIndex);
    }
    renderTradeBox();
    renderInventory();
  }
 
  function updateTradeTargetOptions() {
    const select = document.getElementById('trade-target-player');
    if (!select) return;
    const otherPlayers = getOtherPlayers();
    const currentValue = select.value;
    select.innerHTML = '';
    if (!otherPlayers.length) {
      const placeholder = document.createElement('option');
      placeholder.value = '';
      placeholder.disabled = true;
      placeholder.selected = true;
      placeholder.textContent = 'Chưa có đối thủ';
      select.appendChild(placeholder);
    } else {
      otherPlayers.forEach((player) => {
        const option = document.createElement('option');
        option.value = String(player.id);
        option.textContent = `${player.name} ($${player.money})`;
        select.appendChild(option);
      });
    }
    if (tradeState.targetPlayerId === null || !getPlayerById(tradeState.targetPlayerId)) {
      tradeState.targetPlayerId = otherPlayers.length ? otherPlayers[0].id : null;
    }
    if (tradeState.targetPlayerId !== null) {
      select.value = String(tradeState.targetPlayerId);
    }
  }
 
  function renderTradeBox() {
    const tradeBox = document.getElementById('trade-box');
    const localPlayer = GameCore.state.players.length ? getLocalPlayer() : null;
    const targetPlayer = tradeState.targetPlayerId !== null ? getPlayerById(tradeState.targetPlayerId) : null;
    if (!tradeBox || !localPlayer) {
      return;
    }
 
    updateTradeTargetOptions();
 
    const offerInventory = document.getElementById('trade-offer-inventory');
    const requestInventory = document.getElementById('trade-request-inventory');
    const offerMaxMoney = document.getElementById('offer-max-money');
    const requestMaxMoney = document.getElementById('request-max-money');
    const offerInput = document.getElementById('trade-offer-money');
    const requestInput = document.getElementById('trade-request-money');
    const sendBtn = document.getElementById('trade-send-btn');
    const targetSelect = document.getElementById('trade-target-player');
    if (!offerInventory || !requestInventory || !offerMaxMoney || !requestMaxMoney || !offerInput || !requestInput || !sendBtn || !targetSelect) {
      return;
    }
 
    offerMaxMoney.innerText = localPlayer.money;
    offerInput.max = String(localPlayer.money);
    tradeState.offerCash = clampTradeValue(tradeState.offerCash, localPlayer.money);
    offerInput.value = String(tradeState.offerCash);
 
    if (targetPlayer) {
      requestMaxMoney.innerText = targetPlayer.money;
      requestInput.max = String(targetPlayer.money);
      tradeState.requestCash = clampTradeValue(tradeState.requestCash, targetPlayer.money);
      requestInput.value = String(tradeState.requestCash);
    } else {
      requestMaxMoney.innerText = '0';
      requestInput.max = '0';
      tradeState.requestCash = 0;
      requestInput.value = '0';
    }
 
    offerInventory.innerHTML = '';
    const offerTiles = GameCore.state.board
      .map((tile, index) => ({ tile, index }))
      .filter(({ tile }) => tile.owner === localPlayer.id);
 
    if (offerTiles.length) {
      offerTiles.forEach(({ tile, index }) => {
        const item = document.createElement('div');
        item.className = 'trade-item';
        item.dataset.tileIndex = String(index);
        if (tradeState.selectedOfferTiles.includes(index)) item.classList.add('selected');
        item.innerHTML = `
          <div class="trade-item-title">${tile.name}</div>
          <div class="trade-item-meta">$${tile.price || 0}</div>
        `;
        item.addEventListener('click', () => toggleTradeTile(index, 'selectedOfferTiles'));
        offerInventory.appendChild(item);
      });
    } else {
      const empty = document.createElement('div');
      empty.className = 'trade-empty';
      empty.innerText = 'Bạn không có tài sản để trao đổi.';
      offerInventory.appendChild(empty);
    }
 
    requestInventory.innerHTML = '';
    if (targetPlayer) {
      const requestTiles = GameCore.state.board
        .map((tile, index) => ({ tile, index }))
        .filter(({ tile }) => tile.owner === targetPlayer.id);
 
      if (requestTiles.length) {
        requestTiles.forEach(({ tile, index }) => {
          const item = document.createElement('div');
          item.className = 'trade-item';
          item.dataset.tileIndex = String(index);
          if (tradeState.selectedRequestTiles.includes(index)) item.classList.add('selected');
          item.innerHTML = `
            <div class="trade-item-title">${tile.name}</div>
            <div class="trade-item-meta">$${tile.price || 0}</div>
          `;
          item.addEventListener('click', () => toggleTradeTile(index, 'selectedRequestTiles'));
          requestInventory.appendChild(item);
        });
      } else {
        const empty = document.createElement('div');
        empty.className = 'trade-empty';
        empty.innerText = 'Đối thủ không có tài sản để trao đổi.';
        requestInventory.appendChild(empty);
      }
    }
 
    targetSelect.value = targetPlayer ? String(targetPlayer.id) : '';
    sendBtn.disabled = !targetPlayer || (tradeState.offerCash === 0 && tradeState.selectedOfferTiles.length === 0 && tradeState.selectedRequestTiles.length === 0);

    const tradeStatus = document.getElementById('trade-status');
    if (tradeStatus) {
      if (!targetPlayer) {
        tradeStatus.innerText = 'Chọn người chơi để trao đổi.';
      } else if (tradeState.selectedOfferTiles.length === 0 && tradeState.selectedRequestTiles.length === 0 && tradeState.offerCash === 0 && tradeState.requestCash === 0) {
        tradeStatus.innerText = 'Chưa có đề nghị trao đổi.';
      } else {
        tradeStatus.innerText = `Trao đổi với ${targetPlayer.name}: ${tradeState.selectedOfferTiles.length} tài sản đưa, ${tradeState.selectedRequestTiles.length} tài sản nhận, $${tradeState.offerCash} đổi $${tradeState.requestCash}`;
      }
    }
  }
 
  function bindTradeEvents() {
    const targetSelect = document.getElementById('trade-target-player');
    const offerInput = document.getElementById('trade-offer-money');
    const requestInput = document.getElementById('trade-request-money');
    const sendBtn = document.getElementById('trade-send-btn');
 
    if (targetSelect) {
      targetSelect.addEventListener('change', (e) => {
        const selectedId = parseInt(e.target.value, 10);
        if (!Number.isNaN(selectedId)) {
          tradeState.targetPlayerId = selectedId;
          tradeState.selectedRequestTiles = [];
          tradeState.requestCash = 0;
          renderTradeBox();
        }
      });
    }
 
    const tradeOpenBtn = document.getElementById('trade-open-btn');
    const tradeCloseBtn = document.getElementById('trade-close-btn');
    const tradeModal = document.getElementById('trade-modal');

    if (offerInput) {
      offerInput.addEventListener('input', (e) => {
        const localPlayer = getLocalPlayer();
        tradeState.offerCash = clampTradeValue(e.target.value, localPlayer ? localPlayer.money : 0);
        e.target.value = String(tradeState.offerCash);
        renderTradeBox();
      });
    }
  
    if (requestInput) {
      requestInput.addEventListener('input', (e) => {
        const targetPlayer = getPlayerById(tradeState.targetPlayerId);
        tradeState.requestCash = clampTradeValue(e.target.value, targetPlayer ? targetPlayer.money : 0);
        e.target.value = String(tradeState.requestCash);
        renderTradeBox();
      });
    }
  
    if (sendBtn) {
      sendBtn.addEventListener('click', () => {
        const targetPlayer = getPlayerById(tradeState.targetPlayerId);
        if (!targetPlayer) {
          alert('Chọn người chơi để trao đổi.');
          return;
        }
        // Hiện tại chỉ là giao diện trao đổi. Tính năng thực tế sẽ được bổ sung sau.
        alert(`Gửi đề nghị trao đổi tới ${targetPlayer.name} với ${tradeState.selectedOfferTiles.length} tài sản và $${tradeState.offerCash}.`);
      });
    }

    if (tradeOpenBtn && tradeModal) {
      tradeOpenBtn.addEventListener('click', () => {
        tradeModal.classList.remove('hidden');
        renderTradeBox();
      });
    }

    if (tradeCloseBtn && tradeModal) {
      tradeCloseBtn.addEventListener('click', () => {
        tradeModal.classList.add('hidden');
      });
    }

    if (tradeModal) {
      tradeModal.addEventListener('click', (e) => {
        if (e.target === tradeModal) {
          tradeModal.classList.add('hidden');
        }
      });
    }
  }

  function updateTileOwnershipUI(index, ownerId) {
    const tileElem = document.getElementById(`tile-${index}`);
    if (!tileElem) return;

    // Xoá các class sở hữu cũ
    GameCore.state.players.forEach((p) => {
      tileElem.classList.remove(`owned-p${p.id}`);
    });
    const oldBadge = document.getElementById(`owner-badge-${index}`);
    if (oldBadge) oldBadge.remove();

    if (ownerId === null || ownerId === undefined) return;

    const owner = GameCore.state.players.find((p) => p.id === ownerId);
    if (!owner) return;

    tileElem.classList.add(`owned-p${ownerId}`);
    const badge = document.createElement('div');
    badge.id = `owner-badge-${index}`;
    badge.className = `owner-badge owner-badge-p${ownerId}`;
    badge.style.backgroundColor = owner.color;
    badge.innerText = `🚩 P${ownerId}`;
    tileElem.appendChild(badge);
  }

function updateTileBadgeUI(index, houses) {
    const tileElem = document.getElementById(`tile-${index}`);
    if (!tileElem) return;
    let houseBadge = document.getElementById(`house-tile-${index}`);

    if (houses <= 0) {
      if (houseBadge) houseBadge.remove();
      return;
    }

    // Đặt icon nhà NẰM TRONG thanh màu (group-bar) của ô đất
    const groupBar = tileElem.querySelector('.group-bar');
    if (!groupBar) {
      if (houseBadge) houseBadge.remove();
      return;
    }

    if (!houseBadge) {
      houseBadge = document.createElement('div');
      houseBadge.id = `house-tile-${index}`;
      houseBadge.className = 'house-tile-badge';
      groupBar.appendChild(houseBadge);
    }
    houseBadge.innerText = houses === 5 ? "🏨" : `🏠${houses}`;
  }

  // ĐÁNH DẤU Ô ĐẤT ĐANG BỊ CẦM CỐ
  function updateTileMortgageUI(index, isMortgaged) {
    const tileElem = document.getElementById(`tile-${index}`);
    if (!tileElem) return;

    let mortgageBadge = document.getElementById(`mortgage-badge-${index}`);
    if (!isMortgaged) {
      if (mortgageBadge) mortgageBadge.remove();
      return;
    }
    if (!mortgageBadge) {
      mortgageBadge = document.createElement('div');
      mortgageBadge.id = `mortgage-badge-${index}`;
      mortgageBadge.className = 'mortgage-badge';
      mortgageBadge.innerText = '🔒';
      mortgageBadge.title = 'Đang bị cầm cố';
      tileElem.appendChild(mortgageBadge);
    }
  }

  // HIỆU ỨNG GLOW KHI SỞ HỮU TRỌN NHÓM MÀU
  function updateGroupGlowUI() {
    const { board, players } = GameCore.state;
    const groups = {};
    board.forEach((tile, index) => {
      if (tile && tile.type === "PROPERTY" && tile.group) {
        if (!groups[tile.group]) groups[tile.group] = [];
        groups[tile.group].push(index);
      }
    });

    const monopolizedGroups = {};
    for (const groupName in groups) {
      const indices = groups[groupName];
      const firstOwner = board[indices[0]].owner;
      const allOwned = indices.every(i => board[i].owner !== null && board[i].owner !== undefined);
      const allSameOwner = indices.every(i => board[i].owner === firstOwner);
      if (allOwned && allSameOwner && firstOwner !== null) {
        monopolizedGroups[groupName] = firstOwner;
      }
    }

    // HTML để hiển thị glow theo màu người chơi
    players.forEach((p) => {
      const glowClass = `group-glow-p${p.id}`;
      board.forEach((tile, index) => {
        const tileElem = document.getElementById(`tile-${index}`);
        if (!tileElem) return;
        tileElem.classList.remove(glowClass);
        if (tile.group && monopolizedGroups[tile.group] === p.id) {
          tileElem.classList.add(glowClass);
        }
      });
    });
  }

  // =========================================================
  // MỞ THẺ THÔNG TIN ĐẤT
  // =========================================================
  function openPropertyCard(index) {
    selectedTileIndex = index;
    const tile = GameCore.state.board[index];
    const pos = getGridPosition(index);
    const currentPlayer = GameCore.getCurrentPlayer();

    document.getElementById('info-card-name').innerText = tile.name;

    const footerHouse = document.getElementById('info-footer-house');
    const footerHotel = document.getElementById('info-footer-hotel');
    for (let i = 0; i <= 5; i++) {
      const rentElem = document.getElementById(`info-rent-${i}`);
      const labelElem = document.getElementById(`info-rent-${i}-label`);
      const row = (rentElem && rentElem.parentElement) || (labelElem && labelElem.parentElement);
      if (row) row.style.display = '';
    }
    if (footerHouse) footerHouse.style.display = '';
    if (footerHotel) footerHotel.style.display = '';

    const isRailroad = tile.type === "RAILROAD";
    const isUtility = tile.type === "UTILITY";

    if (isRailroad) {
      const railroadRents = ['$ 25', '$ 50', '$ 100', '$ 200'];
      const labels = ['Sở hữu 1 ga', 'Sở hữu 2 ga', 'Sở hữu 3 ga', 'Sở hữu 4 ga'];
      for (let i = 0; i <= 5; i++) {
        const rentElem = document.getElementById(`info-rent-${i}`);
        const labelElem = document.getElementById(`info-rent-${i}-label`);
        const row = rentElem ? rentElem.parentElement : (labelElem ? labelElem.parentElement : null);
        if (rentElem) rentElem.innerText = railroadRents[i] || '';
        if (labelElem) labelElem.innerText = labels[i] || '';
        if (row) row.style.display = (i >= 4) ? 'none' : '';
      }
      document.getElementById('info-table-when').innerText = 'Ga';
      document.getElementById('info-table-get').innerText = 'Thuê';
      if (footerHouse) footerHouse.style.display = 'none';
      if (footerHotel) footerHotel.style.display = 'none';
      document.getElementById('info-card-price').innerText = `$ ${tile.price || 0}`;
      document.getElementById('info-card-house').innerText = '$ 0';
      document.getElementById('info-card-hotel').innerText = '$ 0';
    } else if (isUtility) {
      const utilityLabels = ['Sở hữu 1 nhà máy', 'Sở hữu 2 nhà máy', '', '', '', ''];
      const utilityValues = ['x4 tiền xúc xắc', 'x10 tiền xúc xắc', '', '', '', ''];
      for (let i = 0; i <= 5; i++) {
        const rentElem = document.getElementById(`info-rent-${i}`);
        const labelElem = document.getElementById(`info-rent-${i}-label`);
        const row = rentElem ? rentElem.parentElement : (labelElem ? labelElem.parentElement : null);
        if (rentElem) rentElem.innerText = utilityValues[i] || '';
        if (labelElem) labelElem.innerText = utilityLabels[i] || '';
        if (row) row.style.display = (i >= 2) ? 'none' : '';
      }
      document.getElementById('info-table-when').innerText = 'Sở hữu';
      document.getElementById('info-table-get').innerText = 'Tiền thuê';
      if (footerHouse) footerHouse.style.display = 'none';
      if (footerHotel) footerHotel.style.display = 'none';
      document.getElementById('info-card-price').innerText = `$ ${tile.price || 0}`;
      document.getElementById('info-card-house').innerText = '$ 0';
      document.getElementById('info-card-hotel').innerText = '$ 0';
    } else {
      const defaultRent = [
        Math.round((tile.price || 100) * 0.08),
        Math.round((tile.price || 100) * 0.4),
        Math.round((tile.price || 100) * 1.2),
        Math.round((tile.price || 100) * 3.2),
        Math.round((tile.price || 100) * 5.5),
        Math.round((tile.price || 100) * 7.5)
      ];
      const rents = (tile.rent && tile.rent.length >= 6) ? tile.rent : defaultRent;

      for (let i = 0; i <= 5; i++) {
        const rentElem = document.getElementById(`info-rent-${i}`);
        const labelElem = document.getElementById(`info-rent-${i}-label`);
        if (rentElem) rentElem.innerText = `$ ${rents[i]}`;
        if (labelElem) labelElem.parentElement.style.display = '';
      }
      document.getElementById('info-table-when').innerText = 'Khi';
      document.getElementById('info-table-get').innerText = 'Nhận';
      if (footerHouse) footerHouse.style.display = '';
      if (footerHotel) footerHotel.style.display = '';

      const houseCost = tile.housePrice || Math.round((tile.price || 100) * 0.75);
      document.getElementById('info-card-price').innerText = `$ ${tile.price || 0}`;
      document.getElementById('info-card-house').innerText = `$ ${houseCost}`;
      document.getElementById('info-card-hotel').innerText = `$ ${houseCost}`;
    }

    // QUẢN LÝ NÚT THAO TÁC
    const controlsDiv = document.getElementById('info-card-controls');
    const btnBuild = document.getElementById('btn-build-house');
    const btnSell = document.getElementById('btn-sell-house');
    const btnMortgage = document.getElementById('btn-mortgage');

if (tile.owner === currentPlayer.id) {
      controlsDiv.classList.remove('hidden');
      const houses = tile.houses || 0;
      const houseCost = tile.housePrice || Math.round((tile.price || 100) * 0.75);
      const isMortgaged = !!tile.mortgaged;
      const mortgageVal = Math.round(tile.price / 2);

      const canBuild = (tile.type === "PROPERTY");

      // Nếu đất đang bị CẦM CỐ thì KHÔNG được xây nhà / dỡ nhà nữa
      if (isMortgaged) {
        btnBuild.style.display = '';
        btnSell.style.display = '';
        btnBuild.disabled = true;
        btnBuild.innerText = `🏦 Đang bị cầm cố`;
        btnSell.disabled = true;
        btnSell.innerText = `📉 Dỡ nhà (bị cầm cố)`;
      } else {
        btnBuild.style.display = canBuild ? '' : 'none';
        btnSell.style.display = canBuild ? '' : 'none';

        if (!canBuild) {
          btnMortgage.style.display = '';
        } else if (houses < 5 && currentPlayer.money >= houseCost) {
          btnBuild.disabled = false;
          btnBuild.innerText = houses === 4 ? `🏨 Nâng cấp Khách sạn ($${houseCost})` : `🏠 Xây nhà ($${houseCost})`;
        } else {
          btnBuild.disabled = true;
          btnBuild.innerText = houses === 5 ? `🏨 Đã tối đa` : `🏠 Xây nhà ($${houseCost})`;
        }

        if (canBuild && houses > 0) {
          btnSell.disabled = false;
          btnSell.innerText = `📉 Dỡ nhà (+$${Math.round(houseCost / 2)})`;
        } else if (canBuild) {
          btnSell.disabled = true;
          btnSell.innerText = `📉 Dỡ nhà`;
        }
      }

      // Nút Cầm cố / Chuộc lại / Bán
      if (GameCore.settings.mortgageInsteadOfSell) {
        btnMortgage.innerText = isMortgaged
          ? `🔓 Chuộc lại (+$${mortgageVal + Math.round(mortgageVal * 0.1)} = trả $${mortgageVal + Math.round(mortgageVal * 0.1)})`
          : `🏦 Cầm cố (+$${mortgageVal})`;
      } else {
        btnMortgage.innerText = `🏦 Bán hẳn (+$${mortgageVal})`;
      }
    } else {
      controlsDiv.classList.add('hidden');
    }

    // ĐỊNH VỊ POP-UP
    infoCardModal.classList.remove('hidden');

    const tileElem = document.getElementById(`tile-${index}`);
    const centerPanel = document.getElementById('center-panel');
    const centerRect = centerPanel.getBoundingClientRect();
    const cardRect = infoCardModal.getBoundingClientRect();

    infoCardModal.style.top = 'auto';
    infoCardModal.style.bottom = 'auto';
    infoCardModal.style.left = 'auto';
    infoCardModal.style.right = 'auto';

    if (tileElem) {
      const tRect = tileElem.getBoundingClientRect();
      const gap = 8;
      const cardW = cardRect.width || 190;
      const cardH = cardRect.height || 200;

      if (pos.side === 'bottom') {
        infoCardModal.style.left = `${tRect.left - centerRect.left}px`;
        infoCardModal.style.top = `${tRect.top - centerRect.top - cardH - gap}px`;
      } else if (pos.side === 'top') {
        infoCardModal.style.left = `${tRect.left - centerRect.left}px`;
        infoCardModal.style.top = `${tRect.bottom - centerRect.top + gap}px`;
      } else if (pos.side === 'left') {
        infoCardModal.style.left = `${tRect.right - centerRect.left + gap}px`;
        infoCardModal.style.top = `${tRect.top - centerRect.top}px`;
      } else if (pos.side === 'right') {
        infoCardModal.style.left = `${tRect.left - centerRect.left - cardW - gap}px`;
        infoCardModal.style.top = `${tRect.top - centerRect.top}px`;
      }

      const boardRect = boardElement.getBoundingClientRect();
      const cardBox = infoCardModal.getBoundingClientRect();

      let curTop = parseInt(infoCardModal.style.top, 10) || 0;
      let curLeft = parseInt(infoCardModal.style.left, 10) || 0;

      const overBottom = cardBox.bottom - boardRect.bottom;
      if (overBottom > 0) curTop -= (overBottom + 8);
      const overRight = cardBox.right - boardRect.right;
      if (overRight > 0) curLeft -= (overRight + 8);
      const overTop = boardRect.top - cardBox.top;
      if (overTop > 0) curTop += (overTop + 8);
      const overLeft = boardRect.left - cardBox.left;
      if (overLeft > 0) curLeft += (overLeft + 8);

      infoCardModal.style.left = `${Math.max(0, curLeft)}px`;
      infoCardModal.style.top = `${Math.max(0, curTop)}px`;
    }

    infoCardModal.classList.remove('hidden');
  }

  // =========================================================
  // HOẠT ẢNH DI CHUYỂN QUÂN CỜ
  // =========================================================
async function moveTokenStepByStep(tokenElem, startPos, steps) {
    tokenElem.classList.add('moving');
    let currentPos = startPos;
    for (let i = 0; i < steps; i++) {
      currentPos = (currentPos + 1) % 40;
      const targetTile = document.getElementById(`tile-${currentPos}`);
      if (targetTile) targetTile.appendChild(tokenElem);
      await new Promise(resolve => setTimeout(resolve, 110));
    }
    tokenElem.classList.remove('moving');
  }

  // =========================================================
  // ĐẤU GIÁ (MỞ / CẬP NHẬT / ĐẶT GIÁ / BỎ LƯỢT)
  // =========================================================
function openAuctionModal() {
    if (!auctionModal) return;
    const a = GameCore.state.auctionState;
    const tile = GameCore.state.auctionTile;
    if (!a || !tile) return;

    document.getElementById('auction-tile-name').innerText = `🔨 Đấu giá: ${tile.name}`;
    renderAuctionModal();
    auctionModal.classList.remove('hidden');
    endTurnBtn.disabled = true;
    rollBtn.disabled = true;
    startAuctionTimer();
  }

  // Khởi động bộ đếm thời gian đấu giá
  function startAuctionTimer() {
    stopAuctionTimer();
    const a = GameCore.state.auctionState;
    if (!a || !a.active) return;
    updateAuctionTimerDisplay();
    auctionTimerInterval = setInterval(() => {
      const cur = GameCore.state.auctionState;
      if (!cur || !cur.active) {
        stopAuctionTimer();
        return;
      }
const remaining = Math.max(0, Math.ceil((cur.timerEnd - Date.now()) / 1000));
      if (auctionTimerEl) auctionTimerEl.innerText = remaining;
      // Hết giờ -> người đang trả giá cao nhất tự động mua
      // (Chỉ áp dụng cho chế độ OFFLINE. Ở ONLINE, server là nguồn sự thật
      //  và sẽ tự kết thúc đấu giá qua lượt đặt giá/bỏ lượt -> tránh desync.)
      if (Date.now() >= cur.timerEnd) {
        stopAuctionTimer();
        const isOnline = window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline();
        if (!isOnline) {
          GameCore.endAuction();
          handleAuctionEnd();
        }
      }
    }, 200);
  }

  function stopAuctionTimer() {
    if (auctionTimerInterval) {
      clearInterval(auctionTimerInterval);
      auctionTimerInterval = null;
    }
  }

  function updateAuctionTimerDisplay() {
    const a = GameCore.state.auctionState;
    if (!a || !auctionTimerEl) return;
    const remaining = Math.max(0, Math.ceil((a.timerEnd - Date.now()) / 1000));
    auctionTimerEl.innerText = remaining;
  }

  function renderAuctionModal() {
    const a = GameCore.state.auctionState;
    if (!a) return;
    const currentBidder = GameCore.getCurrentAuctionBidder();
    const highest = a.highestBidder ? a.highestBidder.name : 'Chưa có';

    document.getElementById('auction-current-bid').innerHTML = `💰 Giá hiện tại: <b>$${a.currentBid}</b>`;
    document.getElementById('auction-current-bidder').innerHTML = `👤 Người trả giá cao nhất: <b>${highest}</b>`;
    document.getElementById('auction-turn').innerHTML = `🎯 Đến lượt: <b>${currentBidder ? currentBidder.name : '...'}</b>`;

    // Hiển thị quân cờ (token) của người trả giá cao nhất
    if (auctionHighestToken) {
      if (a.highestBidder) {
        auctionHighestToken.style.backgroundColor = a.highestBidder.color;
        auctionHighestToken.style.display = 'inline-block';
      } else {
        auctionHighestToken.style.display = 'none';
      }
    }

    updateAuctionTimerDisplay();
  }

  function closeAuctionModal() {
    stopAuctionTimer();
    if (auctionModal) auctionModal.classList.add('hidden');
    endTurnBtn.disabled = false;
    rollBtn.disabled = false;
    renderUI();
  }

  function handleAuctionEnd() {
    // Kết thúc đấu giá: đóng modal và cập nhật giao diện
    closeAuctionModal();
  }

  // =========================================================
  // SETTINGS: CÀI SỐ NGƯỜI CHƠI & BẮT ĐẦU
  // =========================================================
let chosenPlayerCount = 2;
  function updatePlayerCountDisplay() {
    playerCountVal.innerText = chosenPlayerCount;
  }

  // =========================================================
  // CHỌN NHÂN VẬT (QUÂN CỜ) CHO TỪNG NGƯỜI CHƠI
  // =========================================================
  let chosenTokens = []; // Mảng nhân vật {name, emoji} theo từng người chơi

  // Render khung chọn nhân vật theo số người chơi hiện tại
  function renderCharacterPicker() {
    const container = document.getElementById('character-picker');
    if (!container) return;
    container.innerHTML = '';

    // Chuẩn hoá lại mảng chosenTokens đúng số lượng người chơi
    while (chosenTokens.length < chosenPlayerCount) {
      const idx = chosenTokens.length;
      chosenTokens.push(GameCore.animalTokens[idx] || { name: '', emoji: '🎯' });
    }
    chosenTokens.length = chosenPlayerCount;

    // Xác định các nhân vật đang được chọn bởi người khác
    const usedEmojis = chosenTokens.map(t => t.emoji);

    for (let i = 0; i < chosenPlayerCount; i++) {
      const wrapper = document.createElement('div');
      wrapper.className = 'char-picker-player';

      const label = document.createElement('div');
      label.className = 'char-picker-label';
      label.innerHTML = `Người chơi ${i + 1} <small>(${GameCore.playerNames[i] || ''})</small>`;

      const grid = document.createElement('div');
      grid.className = 'char-picker-grid';

      GameCore.animalTokens.forEach((token, ti) => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'char-option';
        btn.dataset.emoji = token.emoji;
        btn.innerHTML = `<span class="char-emoji">${token.emoji}</span><span class="char-name">${token.name}</span>`;

        // Đánh dấu nhân vật đang được người chơi này chọn
        const isMine = chosenTokens[i] && chosenTokens[i].emoji === token.emoji;
        // Bị người khác lấy -> khoá
        const takenByOther = usedEmojis.includes(token.emoji) && !isMine;

        if (isMine) btn.classList.add('selected');
        if (takenByOther) btn.classList.add('taken');

        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          // Nếu nhân vật đã bị người khác chọn -> không cho chọn
          const takenBySomeoneElse = usedEmojis.some((em, ei) => em === token.emoji && ei !== i);
          if (takenBySomeoneElse) return;
          chosenTokens[i] = { name: token.name, emoji: token.emoji };
          renderCharacterPicker();
        });

        grid.appendChild(btn);
      });

      wrapper.appendChild(label);
      wrapper.appendChild(grid);
      container.appendChild(wrapper);
    }
  }

  playerMinus.addEventListener('click', () => {
    if (chosenPlayerCount > 2) {
      chosenPlayerCount--;
      updatePlayerCountDisplay();
      renderCharacterPicker();
    }
  });
  playerPlus.addEventListener('click', () => {
    if (chosenPlayerCount < 8) {
      chosenPlayerCount++;
      updatePlayerCountDisplay();
      renderCharacterPicker();
    }
  });
  updatePlayerCountDisplay();
  renderCharacterPicker();

startGameBtn.addEventListener('click', () => {
    const config = {
      playerCount: chosenPlayerCount,
      initialMoney: parseInt(document.getElementById('set-initial-money').value, 10) || 1500,
      passGoMoney: parseInt(document.getElementById('set-pass-go').value, 10) || 200,
      doubleRentOnFullGroup: document.getElementById('set-double-rent').checked,
      mortgageInsteadOfSell: document.getElementById('set-mortgage').checked,
      jackpotOnFreeParking: document.getElementById('set-jackpot').checked,
      receiveRentWhileJailed: document.getElementById('set-rent-jailed').checked,
      auctionMode: document.getElementById('set-auction').checked,
      chosenTokens: chosenTokens.slice(0, chosenPlayerCount)
    };

// Nếu đang chơi ONLINE -> gửi cài đặt luật lên server
    const isOnline = window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline();
    if (isOnline) {
      settingsOverlay.classList.add('hidden');
      // Broadcast cập nhật luật cho tất cả người chơi trong phòng chờ theo thời gian thực
      const s = (window.Lobby && window.Lobby.socket);
      if (s && window.Lobby && window.Lobby.roomCode) {
        s.emit('room:updateSettings', { code: window.Lobby.roomCode, settings: config });
      }
      if (window.Lobby && window.Lobby.startGame) {
        window.Lobby.startGame(config);
      }
      return; // Server sẽ tạo game & gửi state về -> onGameState dựng bàn cờ
    }

    GameCore.configure(config);
    GameCore.init();
 
    tradeState = {
      targetPlayerId: null,
      offerCash: 0,
      requestCash: 0,
      selectedOfferTiles: [],
      selectedRequestTiles: []
    };
 
    buildBoard();
    buildPlayersUI();
    settingsOverlay.classList.add('hidden');

    // Cập nhật bảng luật chơi bên phải
    const rulesList = document.getElementById('rules-list');
    rulesList.innerHTML = `<ul>
      <li>• Số người chơi: <b>${chosenPlayerCount}</b></li>
      <li>• Tiền khởi tạo: <b>$${config.initialMoney}</b></li>
      <li>• Lương qua ô Start: <b>$${config.passGoMoney}</b></li>
      <li>• Nhân đôi thuê khi trọn nhóm: <b>${config.doubleRentOnFullGroup ? 'Bật' : 'Tắt'}</b></li>
      <li>• Cầm cố thay vì bán: <b>${config.mortgageInsteadOfSell ? 'Bật' : 'Tắt'}</b></li>
      <li>• Jackpot Bãi xe: <b>${config.jackpotOnFreeParking ? 'Bật' : 'Tắt'}</b></li>
      <li>• Nhận thuê khi ở tù: <b>${config.receiveRentWhileJailed ? 'Bật' : 'Tắt'}</b></li>
      <li>• Chế độ đấu giá: <b>${config.auctionMode ? 'Bật' : 'Tắt'}</b></li>
    </ul>`;

    renderUI();
  });

  // =========================================================
  // EVENT LISTENERS TRÒ CHƠI
  // =========================================================
  document.getElementById('close-info-card-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    infoCardModal.classList.add('hidden');
  });

bailBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý -> không chạy cục bộ
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    if (GameCore.payBail()) renderUI();
  });

  // Xử lý thẻ Cơ hội / Khí vận
  if (btnAcceptCard) {
    btnAcceptCard.addEventListener('click', () => {
      // ONLINE: server xử lý -> không chạy cục bộ
      if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
      cardModal.classList.add('hidden');
      const cardResult = GameCore.applyCardEffect();

      if (cardResult && (cardResult.action === "GO_TO_JAIL" || cardResult.action === "MOVE_TO" || cardResult.action === "MOVE_STEPS")) {
        const playerIndex = GameCore.state.currentPlayerIndex;
        const tokenElem = playerTokens[playerIndex];
        const targetTile = document.getElementById(`tile-${cardResult.finalPos}`);
        if (targetTile && tokenElem) targetTile.appendChild(tokenElem);
      }

const landing = cardResult ? cardResult.landing : null;
      if (landing && landing.action === "AUCTION") {
        // Thẻ đưa người chơi tới ô đất không đủ tiền mua -> đấu giá
        openAuctionModal();
        return;
      } else if (landing && landing.action === "PROMPT_BUY") {
        document.getElementById('modal-tile-name').innerText = landing.tile.name;
        document.getElementById('modal-tile-price').innerText = `Giá: $${landing.tile.price}`;
        buyModal.classList.remove('hidden');
        endTurnBtn.disabled = true;
      } else if (landing && landing.action === "DRAW_CARD") {
        document.getElementById('card-type-badge').innerText = landing.card.type;
        document.getElementById('card-title').innerText = landing.card.title;
        document.getElementById('card-text').innerText = landing.card.text;
        cardModal.classList.remove('hidden');
        endTurnBtn.disabled = true;
      } else {
        endTurnBtn.disabled = false;
      }
      renderUI();
    });
  }

// Gieo xúc xắc
  rollBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    // ONLINE: server là nguồn sự thật -> không chạy logic cục bộ (online.js gửi hành động)
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    rollBtn.disabled = true;
    endTurnBtn.disabled = true;

    const res = GameCore.rollDice();
    document.getElementById('dice-result').innerText = `🎲 ${GameCore.getCurrentPlayer().name}: ${GameCore.state.lastRoll} điểm`;

    const playerIndex = GameCore.state.currentPlayerIndex;
    const tokenElem = playerTokens[playerIndex];

    if (res.dice > 0 && res.action !== "STAY_IN_JAIL") {
      await moveTokenStepByStep(tokenElem, res.startPos, res.dice);
      if (res.action === "GO_TO_JAIL") {
        await new Promise(resolve => setTimeout(resolve, 200));
        const jailTile = document.getElementById('tile-10');
        if (jailTile && tokenElem) jailTile.appendChild(tokenElem);
      }
    }

if (res.action === "PROMPT_BUY") {
      document.getElementById('modal-tile-name').innerText = res.tile.name;
      document.getElementById('modal-tile-price').innerText = `Giá: $${res.tile.price}`;
      buyModal.classList.remove('hidden');
    } else if (res.action === "AUCTION") {
      // Đã bắt đầu đấu giá trong gameCore (không đủ tiền mua) -> mở modal đấu giá
      openAuctionModal();
      return;
    } else if (res.action === "DRAW_CARD") {
      document.getElementById('card-type-badge').innerText = res.card.type;
      document.getElementById('card-title').innerText = res.card.title;
      document.getElementById('card-text').innerText = res.card.text;
      cardModal.classList.remove('hidden');
    } else {
      endTurnBtn.disabled = false;
    }

    renderUI();
  });

document.getElementById('buy-yes-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    GameCore.buyPendingProperty();
    buyModal.classList.add('hidden');
    endTurnBtn.disabled = false;
    renderUI();
  });

document.getElementById('buy-no-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    // Lưu lại ô đất TRƯỚC khi skip (vì skipPendingProperty sẽ xoá pendingTile)
    const skippedTile = GameCore.state.pendingTile;
    GameCore.skipPendingProperty();
    buyModal.classList.add('hidden');
    // Nếu bật chế độ đấu giá và ô đất vẫn chưa có chủ -> tiến hành đấu giá
    if (GameCore.settings.auctionMode && skippedTile && (skippedTile.owner === null || skippedTile.owner === undefined)) {
      GameCore.startAuction(skippedTile, GameCore.getCurrentPlayer().id);
      openAuctionModal();
      return;
    }
endTurnBtn.disabled = false;
    renderUI();
  });

// Nút ĐẶT GIÁ NHANH +2 / +10 / +100 trong đấu giá
  auctionAddBtns.forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      // ONLINE: server xử lý
      if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
      const add = parseInt(btn.dataset.add, 10) || 10;
      const a = GameCore.state.auctionState;
      if (!a || !a.active) return;
      const amount = a.currentBid + add;
      const currentBidder = GameCore.getCurrentAuctionBidder();
      if (!currentBidder) return;
      const bidderIndex = GameCore.state.players.findIndex(p => p.id === currentBidder.id);
      if (GameCore.placeBid(bidderIndex, amount)) {
        renderAuctionModal();
        renderUI();
        // Nếu đấu giá đã kết thúc (endAuction được gọi nội bộ) -> đóng modal
        if (!GameCore.isAuctionActive()) {
          handleAuctionEnd();
        }
      } else {
        alert('Không đủ tiền để trả giá!');
      }
    });
  });

  // Nút BỎ LƯỢT trong đấu giá
  if (auctionPassBtn) {
    auctionPassBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      // ONLINE: server xử lý
      if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
      const currentBidder = GameCore.getCurrentAuctionBidder();
      if (!currentBidder) return;
      const bidderIndex = GameCore.state.players.findIndex(p => p.id === currentBidder.id);
      GameCore.passBid(bidderIndex);
      renderUI();
      // Nếu đấu giá còn hoạt động -> cập nhật lượt; ngược lại đóng modal
      if (GameCore.isAuctionActive()) {
        renderAuctionModal();
      } else {
        handleAuctionEnd();
      }
    });
  }

  document.getElementById('btn-build-house').addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    if (selectedTileIndex !== null && GameCore.buildHouse(selectedTileIndex)) {
      renderUI();
      openPropertyCard(selectedTileIndex);
    }
  });

  document.getElementById('btn-sell-house').addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    if (selectedTileIndex !== null && GameCore.sellHouse(selectedTileIndex)) {
      renderUI();
      openPropertyCard(selectedTileIndex);
    }
  });

  document.getElementById('btn-mortgage').addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    if (selectedTileIndex !== null && GameCore.mortgageProperty(selectedTileIndex)) {
      infoCardModal.classList.add('hidden');
      renderUI();
    }
  });

  endTurnBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    // ONLINE: server xử lý
    if (window.GameOnline && window.GameOnline.isOnline && window.GameOnline.isOnline()) return;
    endTurnBtn.disabled = true;
    rollBtn.disabled = false;
    infoCardModal.classList.add('hidden');

    GameCore.endTurn();
    renderUI();
  });

document.getElementById('theme-btn').addEventListener('click', (e) => {
    e.stopPropagation();
    document.body.classList.toggle('dark-theme');
    document.body.classList.toggle('light-theme');
  });
 
  bindTradeEvents();
 
  // =========================================================
  // EXPOSE UI API (cho online.js và các module khác dùng)
  // =========================================================
  window.GameUI = {
    buildBoard,
    buildPlayersUI,
    renderUI,
    openPropertyCard,
    openAuctionModal,
    renderAuctionModal,
    closeAuctionModal,
    handleAuctionEnd,
    moveTokenStepByStep,
    getCurrentPlayerIndex: () => GameCore.state.currentPlayerIndex,
    get playerTokens() { return playerTokens; },
    setPlayerTokens: (tokens) => { playerTokens = tokens; },
    get selectedTileIndex() { return selectedTileIndex; },
    setSelectedTileIndex: (i) => { selectedTileIndex = i; },
    get isAuctionActive() { return GameCore.isAuctionActive(); }
  };
});
