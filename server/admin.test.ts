import {test} from 'node:test';
import assert from 'node:assert/strict';
import {pageInput,settingsPatch} from './admin';
const url='https://play.cyberduel.app/';
const current={appName:'CyberDuel Lite',botUsername:'CyberDuellitebot',webUrl:url,version:2,existing:'preserve'};
test('admin settings preserve omitted fields and refuse financial or integration changes',()=>{
  assert.deepEqual(settingsPatch({appName:'Updated'},current,url),{...current,appName:'Updated'});
  assert.equal(settingsPatch({botUsername:'@CyberDuellitebot'},current,url).botUsername,'CyberDuellitebot');
  for(const body of [{financialActionsEnabled:true},{welcomeBonus:9000},{ton:{pauseGames:false}},{botUsername:'OtherBot'},{appName:''},{webUrl:'http://play.cyberduel.app/'},{webUrl:'https://play.cyberduel.app.evil/'},{webUrl:'https://play.cyberduel.app/broken'},{webUrl:'https://user:password@play.cyberduel.app/'},{webUrl:'https://play.cyberduel.app/?redirect=evil'}]) {
    assert.throws(()=>settingsPatch(body,current,url));
  }
});
test('admin pagination accepts bounded pages and rejects malformed or expensive requests',()=>{
  assert.deepEqual(pageInput({}),{page:1,limit:25,offset:0});
  assert.deepEqual(pageInput({page:'3',limit:'10'}),{page:3,limit:10,offset:20});
  for(const query of [{page:0},{page:-1},{page:1.5},{page:40001},{limit:101},{limit:0},{limit:'bad'}])assert.throws(()=>pageInput(query));
});
