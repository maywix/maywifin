const fs = require('fs');
const cp = require('child_process');

const files = cp.execSync("find . -name '*.js' -not -path '*/node_modules/*'").toString().split('\n').filter(Boolean);

files.forEach(f => {
    let content = fs.readFileSync(f, 'utf8');
    let original = content;
    
    // Fix ${ to ${
    content = content.replace(/\\\\\$\\{/g, '${');
    
    // Fix ` to `
    content = content.replace(/\\`/g, '`');

    if (content !== original) {
        fs.writeFileSync(f, content);
        console.log("Fixed " + f);
    }
});
