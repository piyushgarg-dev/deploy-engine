import path from 'node:path';

import express from 'express';
import Docker from 'dockerode';

import httpProxy from 'http-proxy';

const docker = new Docker();

function pullImagePromisified(image, tag) {
  return new Promise((res, rej) => {
    docker.pull(`${image}:${tag}`, {}, (err) => {
      if (err) {
        rej(err);
      } else {
        return res(true);
      }
    });
  });
}

const managementApp = express();
const proxyApp = express();

const proxy = httpProxy.createProxy();

managementApp.use(express.json());
managementApp.use(express.static(path.resolve('./public')));

const MANAGEMENT_API_PORT = process.env.MANAGEMENT_API_PORT ?? 8080;
const REVERSE_PROXY_HOST = process.env.REVERSE_PROXY_HOST ?? 'localhost';

managementApp.post('/container', async (req, res) => {
  const { image, tag } = req.body;

  const systemImages = await docker.listImages();
  let isExistingImage = false;

  for (const systemImage of systemImages) {
    for (const systemTag of systemImage.RepoTags) {
      if (systemTag === `${image}:${tag}`) {
        isExistingImage = true;
        break;
      }
    }
    if (isExistingImage) break;
  }

  if (!isExistingImage) {
    await pullImagePromisified(image, tag);
  }

  const container = await docker.createContainer({
    Image: `${image}:${tag}`,
    HostConfig: {
      AutoRemove: true,
    },
  });

  const network = docker.getNetwork('deploy-engine-network');

  await container.start();

  const inspect = await container.inspect();

  await network.connect({
    Container: inspect.Id,
  });

  return res.json({
    sttaus: 'success',
    data: {
      containerName: inspect.Name,
      domain: `${inspect.Name}.${REVERSE_PROXY_HOST}`,
    },
  });
});

managementApp.listen(MANAGEMENT_API_PORT, () => {
  console.log(`ManagementAPI is running on PORT ${MANAGEMENT_API_PORT}`);
});

// Reverse Proxy Server
proxyApp.use((req, res) => {
  const containerName = req.hostname.split('.')[0];
  return proxy.web(req, res, {
    target: `http://${containerName}:80`,
  });
});

proxyApp.listen(80, () => {
  console.log(`Reverse Proxy is running on PORT 80`);
});
