// Modified version of https://github.com/spring-io/antora-extensions/blob/main/lib/latest-version-extension.js
// SPDX-License-Identifier: Apache-2.0

'use strict'

const RefRx = /(\d+)\.(\d+)\.(\d+)(?:-(M|RC)(\d+))?$/
const VersionRx = /^(\d+\.\d+)\.\d+(?:-(?:M|RC)\d+)?$/

/**
 * Publishes only the newest release (milestone, RC or patch) of each major.minor line of a component,
 * under /<major>.<minor>. A release is a tag or branch whose name ends in its version.
 * Must be registered before the collector extension so that dropped refs are never built.
 */
module.exports.register = function () {
  const logger = this.getLogger('latest-patch')
  this.once('contentAggregated', ({ contentAggregate }) => {
    for (const { bucket, origin } of outdated(contentAggregate)) {
      logger.info(`Skipping ${bucket.name} ${origin.refname}: not the newest release of its line`)
      // refs that declare the same version share a bucket, so remove this ref's part of it
      bucket.origins.splice(bucket.origins.indexOf(origin), 1)
      bucket.files = bucket.files.filter((file) => file.src.origin !== origin)
      if (!bucket.origins.length) contentAggregate.splice(contentAggregate.indexOf(bucket), 1)
    }
  })
  this.once('componentsRegistered', ({ contentCatalog }) => {
    for (const component of contentCatalog.getComponents()) {
      for (const componentVersion of component.versions) {
        const segment = versionSegment(componentVersion)
        if (segment) componentVersion.versionSegment = segment
      }
    }
  })
}

// 3.27.8 and 4.0.0-M1 => 3.27 and 4.0, so a line keeps its URL from the first milestone on;
// 3.27.9 with prerelease -SNAPSHOT => 3.27-SNAPSHOT, so it cannot collide with the release
function versionSegment ({ version, prerelease }) {
  const line = version.match(VersionRx)?.[1]
  return line && (typeof prerelease === 'string' ? line + prerelease : line)
}

// Returns the refs (a bucket and one of its origins) that are not the newest release of their component's major.minor line.
// Only refs whose name ends in a version take part: tags like assertj-build-3.27.8 and branches like
// antora/3.27.8, but not main, 3.x or 4.0.x.
function outdated (buckets) {
  const latest = new Map()
  const result = []
  for (const bucket of buckets) {
    for (const origin of bucket.origins) {
      const match = origin.refname.match(RefRx)
      if (!match) continue
      const key = `${bucket.name}@${match[1]}.${match[2]}`
      const ref = { bucket, origin, rank: rankOf(match, origin.tag) }
      const previous = latest.get(key)
      if (previous && compare(previous.rank, ref.rank) > 0) {
        result.push(ref)
        continue
      }
      if (previous) result.push(previous)
      latest.set(key, ref)
    }
  }
  return result
}

// orders 4.0.0-M1 < 4.0.0-M2 < 4.0.0-RC1 < 4.0.0 < 4.0.1; for the same version, a branch beats a tag
// because a branch like antora/3.27.9 exists to add or fix the docs of that release
function rankOf ([, , , patch, type, number = 0], tag) {
  return [Number(patch), ['M', 'RC', undefined].indexOf(type), Number(number), tag ? 0 : 1]
}

function compare (a, b) {
  return a[0] - b[0] || a[1] - b[1] || a[2] - b[2] || a[3] - b[3]
}

module.exports.outdated = outdated
module.exports.versionSegment = versionSegment
