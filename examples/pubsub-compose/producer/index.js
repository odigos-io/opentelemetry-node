const express = require('express');
const { PubSub } = require('@google-cloud/pubsub');

const app = express();
app.use(express.json());

const pubsub = new PubSub({ projectId: process.env.GCLOUD_PROJECT || 'demo-project' });
const topicName = process.env.DEMO_TOPIC || 'demo-topic';

async function publish(data) {
  const topic = pubsub.topic(topicName);
  const buffer = Buffer.from(JSON.stringify(data));
  await topic.publish(buffer, {});
}

app.post('/publish', async (req, res) => {
  try {
    await publish({ time: new Date().toISOString(), body: req.body || {} });
    res.json({ ok: true });
  } catch (e) {
    console.error('publish error', e);
    res.status(500).json({ error: String(e) });
  }
});

setInterval(() => {
  publish({ tick: Date.now() }).catch((e) => console.error('interval publish error', e));
}, 2000);

const port = process.env.PORT || 8080;
app.listen(port, () => console.log('producer listening on', port));

