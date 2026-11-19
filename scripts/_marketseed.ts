import { I, toolId, gearStack, makeStack, mulberry32, type ItemStack } from '@solrift/shared';
import { createGameServer } from '../apps/server/src/server';

const server = createGameServer({ seed: 1337, origins: ['http://localhost:3200'], room: { kind: 'adventure' } });
const house = server.room.realm.auctions;
const gear = (id: number, r: 1 | 2 | 3): ItemStack => gearStack(id, 20, r, 'warrior', mulberry32(7));
const put = (seller: string, item: ItemStack, bid: number, buyout: number, hours: number) => house.post({ seller: 'a-' + seller, sellerName: seller, item, bid, buyout, hours, deposit: 3 });
put('Mira', makeStack(I.DIAMOND, 12), 120, 300, 48);
put('Brannoch', gear(toolId('sword', 'diamond'), 3), 900, 2400, 24);
put('Mira', makeStack(I.GOLD_INGOT, 40), 200, 0, 12);
put('Tessaly', makeStack(I.APPLE, 20), 15, 60, 12);
put('Tessaly', makeStack(I.BREAD, 8), 25, 0, 24);
put('Orrin', makeStack(I.IRON_INGOT, 64), 80, 220, 48);
const top = house.bid(1, 'a-Zed', 'Zed', 130, 99999);
console.log('seed bid', JSON.stringify(top));
const port = await server.listen(8788);
console.log('seed server on', port);


