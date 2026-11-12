import json
from pathlib import Path
root=Path(__file__).resolve().parents[2]
groups={
'arena':['Battle Arena','Battle Arena Matchmaking'],
'launch':['🚀 Launch in Telegram Bot'], 'telegramOnly':['Telegram-Only PvP Arena'],
'weapons':['Rock Paper Scissors Well Duals','Rock • Scissors • Paper • Well','Rock-Scissors-Paper-Well'],
 'telegramInfo':['This arena uses encrypted cryptographic signatures directly from the official Telegram app to prevent bots and verify secure duels.','To challenge real players, wager vVIRAL, and secure your wins, please launch this Mini App inside Telegram.'],
'pvp':['Real PvP Mode'],'retry':['Retry','Click to retry RPC call','Повторить / загрузить актуальные данные'],
'credits':['vVIRAL Game Credits'],'wallet':['TON Game Wallet (Custodial)','Wallet Balance','Кошелёк:'],
'connectInfo':['⚠️ CONNECT WALLET TO USE TON GAMES','Please connect your TON wallet via the TON Connect button at the top of the screen to deposit, withdraw, or enter the 1 TON Duel Arena.'],
'available':['AVAILABLE GAME BALANCE','Available Game Balance:'],'internal':['Internal Ledger • Instantly playable'],
'onchain':['On-Chain'],'queue':['In Queue','In Matchmaking Queue','Queue Status: Active'],
'pending':['Pending Out','Outbound','Pending Withdrawal'],
'deposit':['DEPOSIT','DEPOSIT TON','Deposit TON'],'withdraw':['WITHDRAW','Withdraw TON'],'ledger':['HISTORY','TON Game Ledger','CLOSE LEDGER'],
'rules':['Interaction Chart','Interactive Rules','WEAPON OUTCOMES CHART:'],
'chooseMode':['Choose your duel mode and stake','Duel Mode Selector'], 'balance':['Your Balance:','Баланс:'],
'chooseStake':['Choose Stake Amount'], 'realTon':['1 TON Duel','1 TON Duel Settings'],
'paused':['⚠️ 1 TON Duel mode is temporarily paused for system maintenance.','Deposits Suspended','TON deposits are temporarily paused for system upgrading. Please try again later.','Withdrawals Suspended','Outbound TON withdrawals are temporarily paused for backend ledger balancing. Please try again later.','. Депозиты, выводы и TON-матчи приостановлены.'],
'prize':['Prize Pool'],'fee':['Platform Fee','Комиссия, %'],'winnerGets':['Winner Receives'],
'lowBalance':['⚠️ Insufficient vVIRAL credits. Choose a lower stake amount, or claim daily login bonuses/missions to earn more.','⚠️ Insufficient Game TON Balance. You need at least 1 TON in your Game Balance to join.'],
'botPlay':['Auto Bot Training Game','Play with Bot instead 🤖','Quick Play with Bot','Resolve Bot Fight'],
'botInfo':['Practice or play instantly against the AI Arena Bot.'],
'pvpPlay':['Online PvP Duel Queue','Search Another PvP Match'], 'pvpInfo':['Atomically queues you up with another live player.'],
'searching':['Waiting for Opponent...'],'searchInfo':['Searching matchmaking queue. Real Multiplayer PvP matches require exactly two real Telegram players.'],
'cancelSearch':['Cancel Matchmaking'],'ready':['⚔️ Battle Initiated ⚔️'], 'countdown':['Pre-Round Countdown'], 'go':['FIGHT! ⚔️'],
'countdownInfo':['Hold steady! Select your strategic move as soon as the battle begins.'],
'chooseWeapon':['Action Phase','Choose Your Weapon'],'moveInfo':['Your move is processed and verified by the server'],
'forfeit':['Forfeit & Leave Match','Forfeit Match','YOU FORFEIT 💀'],
'submitted':['Successfully Submitted'],'waitMove':['Waiting for opponent to lock their weapon...'],
'result':['Resolution Phase'],'draw':["It's a DRAW! 🤝",'Ничья'],'win':['W.O. VICTORY! 🎉','VICTORY! 🎉'], 'loss':['DEFEAT! 💀'],
'yourMove':['Your Move'],'otherMove':['Opponent Move'],'again':['PLAY AGAIN'],'cancelled':['Match Dissolved'],
'cancelInfo':['This battle was cancelled or dissolved because a player left the arena queue or failed to select their weapon.'], 'lobby':['Return to Lobby','BACK TO ARENA'],
'leaderInfo':['The legendary top 10 warriors in the Rock Paper Scissors Well Arena. Updated in real time!'],
'refresh':['Refresh Leaderboard','Обновить данные'],
'empty':['No entries found yet.','No Transactions Yet','No active weapons on screen'], 'firstWin':['Be the first to secure a victory and claim the crown!','Keep winning battles to place in the Top 10!'],
'matches':['matches •','matches','матчей ·','Матчи'], 'wins':['W','W:','Wins','Current Wins:','побед'],'losses':['L:'],'position':['Your Current Position'],
'missionInfo':['Power up your VIRAL Arena standing! Earn extra vVIRAL credits by completing daily challenges.'],
'firstMatch':['First Blood'],'firstMatchInfo':['Engage in at least 1 match (PvP or Bot) in the Arena.'],
'champion':['Champion Duelist'],'championInfo':['Claim victory in 3 matches in the Arena.'],
'inviteOne':['Ecosystem Recruiter'],'inviteOneInfo':['Invite 1 new combatant using your referral link.'],
'community':['Arena Cadet'],'communityInfo':['Join the official VIRAL community channel.'],
'join':['Join Chat','Re-join group'],'verify':['Verify Membership'],
'referralInfo':['Invite friends and stack credits through two levels of reach!','Invite other duelists and earn commission rewards on multiple levels of active gameplay stakes!'],
'direct':['Level 1 (Direct)','L1 Direct'],'indirect':['Level 2 (Indirect)','L2 Indirect'],
'referralLink':['Your Custom Referral Link','Your Referral Link'],'qr':['View QR Code','Referral QR Code'],'copy':['Copy Link','COPY'],
'overview':['Обзор'],'players':['Игроки'],'transactions':['Транзакции'],'settings':['Настройки'],'audit':['Журнал'],
'back':['Назад'],'next':['Далее'],'page':['Стр.'],'of':['из'],'records':['записей'],
'adminTitle':['Управление игрой','Администрирование CyberDuel Lite'],'owner':['CyberDuel Lite · доступ владельца'],
'readonly':['Реальные TON-операции выключены. Балансы и расчёт матчей здесь доступны только для просмотра.'],
'updated':['Все записи PostgreSQL · обновлено'],'new24':['Новые за 24 ч'],'withWallet':['Игроки с кошельком'], 'invited':['Приглашённые игроки'],
'completed':['Завершённые'],'activeGames':['Активные матчи'],'waitingPlayers':['Ожидают соперника'],'creditRecords':['Записи vVIRAL'], 'creditTotal':['Всего vVIRAL'],
'ledgerView':['TON: просмотр учёта'],'ledgerInfo':['Депозиты и выводы показаны отдельно от проводок, без повторного суммирования.'],
'deposits':['· депозиты:','Депозиты TON'],'withdrawals':['· выводы:','Выводы TON'],
'searchPlayer':['Поиск по имени или Telegram ID'],'adminId':['Telegram ID администратора'],'playerId':['Telegram ID игрока'],
'nameId':['Имя или ID'],'allPlayers':['Все игроки'],'find':['Найти'],'currency':['Валюта'],'all':['Все'], 'section':['Раздел'],
'creditRecords':['Записи vVIRAL','Начисления vVIRAL'],'ledger':['HISTORY','TON Game Ledger','CLOSE LEDGER','Журнал:','Проводки TON'],
'fromDate':['С даты (UTC)'],'toDate':['По дату (UTC)'],'status':['Статус'],'allStatuses':['Все статусы'],
'playerRole':['Игрок'],'matchStats':['Матчи / победы / поражения'],'joined':['Регистрация:','Profile Timestamp:'],'referredBy':['· Пригласил:','Referred By:'],
'note':['Внутренняя заметка администратора'],'saving':['Сохранение…'],'saveNote':['Сохранить заметку'],
'noteSaved':['Заметка сохранена. Действие записано в журнал.'], 'settingsSaved':['Настройки сохранены. Предыдущие значения доступны в журнале.'],
'playerTx':['Транзакции игрока'],'playerMatches':['Матчи игрока'],'noResults':['Записей по этим условиям нет.'],'unnamed':['Без имени'], 'viewPlayer':['Карточка'],
'systemEntry':['системная запись'],'reference':['Связь:'],'moves':['Ходы:'],'winner':['Победитель:'],'adminRole':['Администратор'],
 'target':['Объект:'],'changes':['Изменения'],'appSettings':['Настройки приложения'],'appName':['Название приложения'],'connectedBot':['Подключённый бот'],
'appUrl':['HTTPS-адрес приложения'],'urlInfo':['Адрес сохраняется в пределах текущего домена. Одновременные изменения защищены версией настроек.'],
'saveSettings':['Сохранить настройки'],'economy':['Текущая экономика и правила'],'economyInfo':['Просмотр работающих параметров. Изменение экономики и включение TON в этапе 1 недоступны.'],
'welcomeBonus':['Приветственный бонус'],'winReward':['Награда за победу'],'participation':['Участие'],'chooseStake':['Choose Stake Amount','Ставки vVIRAL'],
'communityTools':['Инструменты сообщества','Tournament Announcements & Pinning'],
'broadcast':['Broadcast Telegram Announcement'],'announcementHint':['Type official community tournament announcement to broadcast...'], 'pinned':['Ecosystem Live Leaderboard Pinned Message'],
'invalidAmount':['Некорректная сумма'],'role':['Роль:'],'adminOpen':['Открыть управление игрой'],
'adminAccess':['Админка доступна аккаунту, назначенному владельцем по Telegram ID. Имя и nickname не дают права администратора.'],
'license':['Arena Battle License'],'tier':['Tier'],'nextTier':['Next Tier:'],'winsLeft':['wins left'],
'legend':['🎉 SUPREME STAGE COMPLETED 🎉','You are an absolute legend of the RSPW Arena!'], 'allTiers':['View All Arena Tiers','Arena Rank Tiers'],
'soundOn':['Unmute Sounds'],'soundOff':['Mute Sounds'],'rankInfo':['Winning games increases your status. Defeats do not decrease tier progress—it is permanently saved!'],
'active':['Active'],'requires':['Requires'],'promotion':['TIER PROMOTION','PERMANENT REWARD UNLOCKED','CLAIM NEW TITLE'],
'share':['Share App with Friends'],'shareInfo':['Your friend can scan this using Telegram, their phone camera, or another QR scanner to start playing under your network!'],
'ruleRock':['Beats ✂️ Scissors. Loses to 📄 Paper & 🕳️ Well.'],'ruleScissors':['Beats 📄 Paper. Loses to 👊 Rock & 🕳️ Well.'],
'rulePaper':['Beats 👊 Rock & 🕳️ Well. Loses to ✂️ Scissors.'],'ruleWell':['Beats 👊 Rock & ✂️ Scissors. Loses to 📄 Paper.'],
'ruleInfo':['On-chain fair results verified. Pick carefully and outsmart your opponent!','Бумага побеждает камень и колодец; колодец — камень и ножницы; камень — ножницы; ножницы — бумагу.'],
'amount':['Amount to Pay:','Outbound Amount','Withdrawal Amount','Credited TON','Select Preset Amount'], 'customAmount':['Or Custom Amount'],
'intent':['Deposit Intent ID'],'treasury':['Treasury Wallet:'],'comment':['Required Comment:'],
'commentInfo':['⚠️ CRITICAL DIRECTIVE:','You MUST include the exact unique comment above in your transaction, or your deposit will not be credited.'],
'processing':['CREATING INTENT...','Detecting on-chain transaction...','SUBMITTING REQUEST...'],
'successful':['Deposit Successful!'],'credited':['to your internal Game TON Balance! Enjoy the Arena!','has been added to your Game Balance.'],
'submittedRequest':['Request Submitted!'],'processing':['CREATING INTENT...','Detecting on-chain transaction...','SUBMITTING REQUEST...','Your withdrawal request has been successfully created and is now processing.'],
'returnWallet':['Returning to Wallet in 2.5s...','Returning to Wallet in 2.8s...'],
'min':['Min limit:','Min 1.0 TON'],'max':['. Max limit:'],'perTransaction':['per transaction.'],'destination':['Destination Address:'],
'viewTransaction':['View Transaction'],'ledgerEmptyInfo':['All your on-chain deposits, outbound withdrawals, stakes, wins, losses, draws, and refunds will appear here.'],
'cosmetic':['COSMETIC'],'maxBadge':['MAX BADGE'],
'sandbox':['Dynamic Multi-Window'],'windowArena':['Cross-Window Arena'],'windowInfo':['Open multiple browser tabs or popup windows, arrange them side by side, and watch weapons bounce and traverse between screens in real-time!'],
'floating':['Floating Window'],'thisTab':['This Tab:'],'tabsActive':['Tabs Active:'],'spawn':['Spawn Weapon'],
'spawnInfo':['Tap below to spawn and seed rock, paper, scissors, or wells into the arena.'],'clear':['Clear Arena'],
'achievements':['Arena Fusion Achievements','Multi-Window Constructor'],'conversions':['Conversions'],'absorbed':['Absorbed by Wells'],'bounces':['Total Bounces']
}
groups.update({
 'mainnet':['Mainnet'],'testnet':['Testnet'],'noMove':['No Move'],
 'refFee10':['10% Commission'],'refFee5':['5% Commission'],
 'noUsername':['username не установлен'],'adminRole':['Администратор','администратор'], 'playerRole':['Игрок','игрок','Игрок:'],
 'soundOn':['Unmute Sounds'],'soundOff':['Mute Sounds'],
 'gravityOn':['Gravity ON'],'gravityOff':['Gravity OFF'],'portalsOn':['Portals ON'],'portalsOff':['Portals OFF'],
 'paused':groups['paused']+['1 TON DUEL PAUSED'],
 'connectInfo':groups['connectInfo']+['CONNECT WALLET TO PLAY'],
 'lowBalance':groups['lowBalance']+['INSUFFICIENT TON BALANCE'],
 'realTon':groups['realTon']+['PLAY FOR 1 TON'],
 'processing':groups['processing']+['Broadcasting...','Publishing...','POLLING TRANSACTION...','проверяется…'],
 'broadcast':groups['broadcast']+['Publish & Pin Leaderboard to Community Group'],
 'deposit':groups['deposit']+['INITIALIZE DEPOSIT','PAY VIA TON CONNECT'],
 'withdraw':groups['withdraw']+['REQUEST OUTBOUND WITHDRAWAL','Withdrawal','Withdrawal Requested'],
 'successful':groups['successful']+['The deposit has completed.'],
 'credited':groups['credited']+['We have successfully credited'],
 'refresh':groups['refresh']+['Обновить'],
})
langs=['en','ru','de','es','fr','pt','tr','id','hi','ja','zh-CN','ar']
lookup={}
# Reuse already translated text (both English and Russian source spellings).
def flatten(v,p=''):
 for k,x in v.items():
  key=f'{p}.{k}' if p else k
  if isinstance(x,dict):yield from flatten(x,key)
  else:yield key,x
for lang in ['en','ru']:
 for key,text in flatten(json.loads((root/f'locales/{lang}.json').read_text())):
  lookup[text]=key
rows=[]
for line in (root/'scripts/design/copy.tsv').read_text().splitlines():
 cells=line.split('|');assert len(cells)==13,cells
 key,*values=cells;rows.append((key,values))
 for text in [values[0],*groups.get(key,[])]:lookup[text]='ui.'+key
# Extra aliases reuse existing dictionary.
for source,key in {'ROCK':'play.rock','SCISSORS':'play.scissors','PAPER':'play.paper','WELL':'ui.well','Global Leaderboard':'leaderboard.title','Daily Missions':'missions.title','Referral Program':'referrals.title','Fetching champions...':'common.loading','Загрузка админки…':'common.loading','Загрузка данных…':'common.loading','Syncing...':'common.loading','Закрыть':'common.close','GOT IT':'common.close','CLOSE VIEW':'common.close','CLOSE WINDOW':'common.close','START OVER / CHOOSE DIFFERENT AMOUNT':'ui.back','Go Play':'nav.play','Claimed':'missions.claimed','Progress':'missions.progress','Your Referral Link':'ui.referralLink','Referral Metrics':'profile.stats','% WR':'profile.rate','% Progress':'missions.progress','Игрок:':'ui.playerRole'}.items():lookup[source]=key
for langindex,lang in enumerate(langs):
 path=root/f'locales/{lang}.json';data=json.loads(path.read_text());data['ui']={key:values[langindex] for key,values in rows};data['profile']['loading']=data['common']['loading'];data['home']['subtitle']=data['ui']['homeInfo'];path.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
(root/'src/lib/copy-aliases.json').write_text(json.dumps(lookup,ensure_ascii=False,indent=2)+'\n')
print(f'{len(rows)} new phrases per language; {len(lookup)} source aliases')
