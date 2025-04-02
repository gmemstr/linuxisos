import { DebianWorkflow } from "./debian";
import { ArchLinuxWorkflow } from "./arch-linux";
import { FedoraWorkflow } from "./fedora";
import { UbuntuWorkflow } from "./ubuntu";
import { Hono } from 'hono'
import { cache } from 'hono/cache'
import { Feed } from 'feed';

export { DebianWorkflow, ArchLinuxWorkflow, FedoraWorkflow, UbuntuWorkflow };

const app = new Hono()

app.get('/', async (c) => {
	let response = await c.env.ASSETS.fetch(c.req.raw);
	if (response.status !== 200) {
		return response;
	}
	const torrents = await c.env.R2.list();
	const sections = {};
	torrents.objects.forEach(torrent => {
		const prefix = torrent.key.split('-')[0];
		if (!sections[prefix]) {
			sections[prefix] = '';
		}
		sections[prefix] += `<a href="https://linuxtorrents.gmem.ca/${torrent.key}"><li>📂 ${torrent.key}</li></a>`;
	});

	let list = Object.entries(sections).map(([section, li]) =>
		`<details><summary>${section}</summary><ul>${li}</ul></details>`
	).join('');

	return new HTMLRewriter()
		.on("main", {
			element(element) {
				element.setInnerContent(list, {html: true});
			}
		})
		.transform(response);
});

app.get('/atom', cache({ cacheName: 'linuxisos-index-atom', cacheControl: 'max-age=1800' }),async (c) => {
	return new Response((await buildFeed(c.env)).atom1(), {headers: { 'Content-Type': 'application/atom+xml' }});
});

app.get('/rss', cache({ cacheName: 'linuxisos-index-rss', cacheControl: 'max-age=1800' }), async (c) => {
	return new Response((await buildFeed(c.env)).rss2(), {headers: { 'Content-Type': 'application/atom+xml' }});
});

app.get('/*', async (c) => {
	return await c.env.ASSETS.fetch(c.req.raw);
});

async function buildFeed(env) {
	const feed = new Feed({
		title: "gmem's Linux ISOs Tracker",
		description: "Tracking Linux ISO torrents for download.",
		id: "https://linuxisos.gmem.ca",
		link: "https://linuxisos.gmem.ca",
		generator: "linuxisos.gmem.ca",
		feedLinks: {
			rss: "https://linuxisos.gmem.ca/rss",
			atom: "https://linuxisos.gmem.ca/atom"
		},
		author: {
			name: "Arch Retriever",
			email: "linuxisos@gmem.ca",
			link: "https://arch.dog"
		}
	});
	const torrents = await env.R2.list();
	torrents.objects.forEach(torrent => {
		feed.addItem({
			title: torrent.key,
			id: torrent.key,
			link: `https://linuxtorrents.gmem.ca/${torrent.key}`,
			description: '',
			content: '',
			date: torrent.uploaded
		});
	});

	return feed;
}

export default {
	fetch: app.fetch,
	async scheduled(event, env, ctx) {
		let newId = await crypto.randomUUID();
		let debian = await env.DEBIAN_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of debian workflow`);
		newId = await crypto.randomUUID();
		let arch = await env.ARCHLINUX_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of archlinux workflow`);
		newId = await crypto.randomUUID();
		let fedora = await env.FEDORA_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of fedora workflow`);
		newId = await crypto.randomUUID();
		let ubuntu = await env.UBUNTU_WORKFLOW.create({ id: newId });
		console.log(`started ${newId} of ubuntu workflow`);
	}
}
