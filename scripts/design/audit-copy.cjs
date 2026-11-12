const ts=require('typescript'),fs=require('fs');
for(const file of ['src/App.tsx','src/components/AdminPanel.tsx','src/components/WindowGame.tsx']){
 const s=fs.readFileSync(file,'utf8'),ast=ts.createSourceFile(file,s,99,true,4);console.log('\n'+file);
 function walk(n){if(ts.isJsxText(n)&&/[A-Za-zА-Яа-я]/.test(n.text)){const x=n.text.replace(/\s+/g,' ').trim();if(x)console.log(ast.getLineAndCharacterOfPosition(n.pos).line+1,'TEXT',x);}
 if(ts.isStringLiteral(n)&&n.text.length>2){let p=n.parent,jsx=false,blocked=false;while(p){if(ts.isJsxAttribute(p)&&!['title','placeholder','aria-label','alt'].includes(p.name.text))blocked=true;if(ts.isCallExpression(p)&&['t','tx','getTranslation'].includes(p.expression.getText(ast)))blocked=true;if(ts.isJsxExpression(p))jsx=true;p=p.parent;}if(jsx&&!blocked&&/[a-zA-Zа-яА-Я]/.test(n.text)&&!/^#|^https:|^[a-z0-9_]+$/.test(n.text))console.log(ast.getLineAndCharacterOfPosition(n.pos).line+1,'EXPR',n.text);}
 ts.forEachChild(n,walk);}walk(ast);
}
