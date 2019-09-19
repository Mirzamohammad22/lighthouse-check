import fetch from 'node-fetch';
import get from 'lodash.get';
import LighthouseCheckError from './LighthouseCheckError';
import {
  ERROR_CODE_ATTEMPT_FAILED,
  ERROR_CODE_GENERIC,
  ERROR_CODE_NO_RESULTS,
  ERROR_CODE_NO_URLS,
  ERROR_CODE_UNAUTHORIZED,
  ERROR_QUEUE_MAX_USED_DAY
} from './errorCodes';

const API_URL = process.env.API_URL || 'https://www.foo.software/api/v1';
const API_PAGES_PATH = '/pages';
const API_QUEUE_ITEMS_PATH = '/queue/items';
const API_LIGHTHOUSE_AUDIT_PATH = '/lighthouseAudits/queueIds';
const DEFAULT_TAG = 'lighthouse-check';
const SUCCESS_CODE_GENERIC = 'SUCCESS';
const TRIGGER_TYPE = 'lighthouseAudit';

// this should only be defined when working locally.
if (process.env.API_URL) {
  process.env['NODE_TLS_REJECT_UNAUTHORIZED'] = 0;
}

export const fetchLighthouseAudits = async ({ apiToken, queueIds }) => {
  try {
    const lighthouseAuditsResponse = await fetch(
      `${API_URL}${API_LIGHTHOUSE_AUDIT_PATH}/${queueIds}`,
      {
        method: 'get',
        headers: {
          Authorization: apiToken,
          'Content-Type': 'application/json'
        }
      }
    );
    const lighthouseAuditsJson = await lighthouseAuditsResponse.json();

    if (lighthouseAuditsJson.status >= 400) {
      throw new LighthouseCheckError('No results found.', {
        code: ERROR_CODE_NO_RESULTS
      });
    }

    const lighthouseResults = get(
      lighthouseAuditsJson,
      'data.lighthouseaudit',
      []
    );

    // success
    return {
      code: SUCCESS_CODE_GENERIC,
      data: lighthouseResults,
      message: 'Lighthouse results successfully fetched.'
    };
  } catch (error) {
    return {
      code: error.code || ERROR_CODE_GENERIC,
      error
    };
  }
};

export const fetchAndWaitForLighthouseAudits = async ({
  apiToken,
  timeout,
  queueIds
}) => {
  try {
    // poll while loop?
  } catch (error) {
    return {
      code: error.code || ERROR_CODE_GENERIC,
      error
    };
  }
};

export const triggerLighthouse = async ({ apiToken, tag, urls = [] }) => {
  try {
    let apiTokens = urls;

    if (!Array.isArray(urls) || !urls.length) {
      const pagesResponse = await fetch(`${API_URL}${API_PAGES_PATH}`, {
        method: 'get',
        headers: {
          Authorization: apiToken,
          'Content-Type': 'application/json'
        }
      });
      const pagesJson = await pagesResponse.json();

      if (pagesJson.status >= 400) {
        throw new LighthouseCheckError(
          `Account wasn't found for the provided API token.`,
          {
            code: ERROR_CODE_UNAUTHORIZED
          }
        );
      }

      const pages = get(pagesJson, 'data.page', []);
      if (!pages.length) {
        throw new LighthouseCheckError('No URLs were found for this account.', {
          code: ERROR_CODE_NO_URLS
        });
      }

      apiTokens = pages.map(current => current.apiToken);
    }

    // enqueue urls for Lighthouse audits
    const queueItemsResponse = await fetch(
      `${API_URL}${API_QUEUE_ITEMS_PATH}`,
      {
        method: 'post',
        headers: {
          Authorization: apiToken,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tag: tag || DEFAULT_TAG,
          pages: apiTokens.join(),
          type: TRIGGER_TYPE
        })
      }
    );
    const queueItemsJson = await queueItemsResponse.json();
    const queue = get(queueItemsJson, 'data.queue');

    // if no results
    if (!queue.results.length) {
      throw new LighthouseCheckError('No results.', {
        code: ERROR_CODE_NO_RESULTS
      });
    }

    // if all urls failed to be enqueued...
    if (queue.errors === queue.results.length) {
      const errorCode = queue.results[0].code;
      const errorMessage =
        errorCode === ERROR_QUEUE_MAX_USED_DAY
          ? queue.results[0].message
          : 'All URLs failed to be enqueued. Examine the "data" property of this error for details.';

      throw new LighthouseCheckError(errorMessage, {
        code: errorCode,
        data: queue.results
      });
    }

    // if only some urls succeeded to be enqueued...
    if (queue.errors) {
      throw new LighthouseCheckError(
        'Only some of your account URLs were enqueued. Examine the "data" property of this error for details. Typically this occurs when daily limit has been met for a given URL. Check your account limits online.',
        {
          code: ERROR_CODE_ATTEMPT_FAILED,
          data: queue.results
        }
      );
    }

    // success
    return {
      code: SUCCESS_CODE_GENERIC,
      data: queue.results,
      message: `${queue.results.length} ${
        queue.results.length > 1 ? 'URLs' : 'URL'
      } successfully enqueued for Lighthouse. Visit dashboard for results.`
    };
  } catch (error) {
    return {
      code: error.code || ERROR_CODE_GENERIC,
      error
    };
  }
};
