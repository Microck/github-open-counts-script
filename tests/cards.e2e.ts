import {test} from '@e2e-dev/web';
import {expect} from 'e2e';
test('pinned cards without stats gain zero counts and dynamic cards are discovered',async({app,screen,browser})=>{
 await app.open('/');
 await expect(screen.getByRole('link','0 open issues')).toBeVisible();
 await expect(screen.getByRole('link','0 open pull requests')).toHaveAttribute('href','/fixture/sample/pulls');
 await screen.getByRole('button','Add card').click();
 await expect.poll(()=>browser.evaluate(()=>document.querySelectorAll('[data-github-open-count="issues"]').length)).toBe(2);
 await expect.poll(()=>browser.evaluate(()=>Array.from(document.querySelectorAll('[data-github-open-count]')).every(node=>node.getAttribute('aria-label')?.startsWith('0 open')))).toBe(true);
 expect(await browser.evaluate(()=>(window as any).__requests.length)).toBe(4);
});
test('duplicate cards share in-flight API requests',async({app,browser})=>{
 await app.open('/?case=duplicates');
 await expect.poll(()=>browser.evaluate(()=>document.querySelectorAll('[aria-label="0 open issues"]').length)).toBe(2);
 expect(await browser.evaluate(()=>(window as any).__requests.length)).toBe(2);
});
test('malformed cached counts are refetched',async({app,screen,browser})=>{
 await app.open('/?case=cache');
 await expect(screen.getByRole('link','0 open issues')).toBeVisible();
 expect(await browser.evaluate(()=>(window as any).__requests.length)).toBe(2);
});
test('HTTP failure restores native links without fabricating zero counts',async({app,screen,browser})=>{
 await app.open('/?case=error');
 await expect.poll(()=>browser.evaluate(()=>(window as any).__requests.length)).toBe(2);
 await expect(screen.getByRole('link','Original issues')).toBeVisible();
 expect(await browser.evaluate(()=>document.querySelectorAll('[data-github-open-count]').length)).toBe(0);
});
test('invalid successful API bodies never render NaN or fake counts',async({app,browser})=>{
 await app.open('/?case=invalid');
 await expect.poll(()=>browser.evaluate(()=>(window as any).__requests.length)).toBe(2);
 await expect.poll(()=>browser.evaluate(()=>document.querySelectorAll('[data-github-open-count]').length)).toBe(0);
 expect(await browser.evaluate(()=>document.body.textContent?.includes('NaN open'))).toBe(false);
});

test('pagination subtracts pull requests from combined issue totals',async({app,screen})=>{
 await app.open('/?case=counts');
 await expect(screen.getByRole('link','4 open issues')).toHaveAttribute('href','/fixture/sample/issues');
 await expect(screen.getByRole('link','3 open pull requests')).toHaveAttribute('href','/fixture/sample/pulls');
});
