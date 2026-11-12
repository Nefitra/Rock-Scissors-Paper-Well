import aliases from './copy-aliases.json';
import {getTranslation} from './i18n';

/** Source aliases keep old labels and shared components on the same translation keys. */
export function translateCopy(language:string,source:string):string {
  const key=(aliases as Record<string,string>)[source] || (source.startsWith('ui.')?source:'');
  return key?getTranslation(language,key):source;
}

const enums:Record<string,string>={
  rock:'play.rock',scissors:'play.scissors',paper:'play.paper',well:'ui.well',
  completed:'ui.completed',posted:'ui.posted',created:'ui.created',submitted:'ui.submittedRequest',requested:'ui.submittedRequest',
  credited:'ui.credited',Credited:'ui.credited',confirmed:'ui.confirmed',sent:'ui.sent',failed:'ui.failed',rejected:'ui.rejected',
  searching:'ui.searching',waiting:'ui.waitingPlayers',matched:'ui.matched',resolving:'ui.processing',expired:'ui.expired',canceled:'ui.cancelled',cancelled:'ui.cancelled',
  pending:'ui.pending',queued:'ui.queue',signing:'ui.processing',success:'common.success',active:'ui.active',
  transactions:'ui.creditRecords',ledgerTransactions:'ui.ledger',tonDeposits:'ui.deposits',tonWithdrawals:'ui.withdrawals',
  credit:'ui.credited',debit:'ui.withdraw',deposit:'ui.deposit',withdrawal:'ui.withdraw',withdrawal_requested:'ui.submittedRequest',
  win:'ui.winReward',loss:'ui.loss',draw:'ui.draw',stake:'ui.stake',refund:'ui.balance',
  free:'ui.free',pvp:'ui.pvp',bot:'ui.botPlay',ton:'ui.realTon',
  'player.note.updated':'ui.noteSaved','settings.updated':'ui.settingsSaved',
  TON_DEPOSIT_CONFIRMED:'ui.deposit',WITHDRAWAL_CONFIRMED:'ui.withdraw',WITHDRAWAL_REVERTED:'ui.balance',
};
/** Translate display labels only; never translate values sent to the server. */
export function enumLabel(language:string,value:string):string {
  return enums[value]?getTranslation(language,enums[value]):value;
}

/** Server error details stay in diagnostics; players get a useful localized message. */
export function localizedError(language:string,source:string):string {
  const exact=translateCopy(language,source);if(exact!==source)return exact;
  const key=/version|changed|conflict/i.test(source)?'stale'
    :/telegram|reopen/i.test(source)?'telegramInfo'
    :/administrator|admin.*only|forbidden/i.test(source)?'adminAccess'
    :/insufficient|not enough|balance.*low/i.test(source)?'lowBalance'
    :/expired/i.test(source)?'expired'
    :/paused|disabled|TON/i.test(source)?'paused':'requestError';
  return getTranslation(language,'ui.'+key);
}
