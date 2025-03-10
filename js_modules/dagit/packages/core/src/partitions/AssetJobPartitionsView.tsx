import {Box, Button, Colors, Subheading} from '@dagster-io/ui';
import React from 'react';

import {useAssetGraphData} from '../asset-graph/useAssetGraphData';
import {LaunchAssetExecutionButton} from '../assets/LaunchAssetExecutionButton';
import {
  mergedAssetHealth,
  explodePartitionKeysInRanges,
  isTimeseriesDimension,
} from '../assets/MultipartitioningSupport';
import {usePartitionHealthData} from '../assets/usePartitionHealthData';
import {useViewport} from '../gantt/useViewport';
import {DagsterTag} from '../runs/RunTag';
import {repoAddressToSelector} from '../workspace/repoAddressToSelector';
import {RepoAddress} from '../workspace/types';

import {JobBackfillsTable} from './JobBackfillsTable';
import {CountBox, usePartitionDurations} from './OpJobPartitionsView';
import {PartitionGraph} from './PartitionGraph';
import {PartitionState, PartitionStatus} from './PartitionStatus';
import {getVisibleItemCount, PartitionPerAssetStatus} from './PartitionStepStatus';
import {GRID_FLOATING_CONTAINER_WIDTH} from './RunMatrixUtils';
import {usePartitionStepQuery} from './usePartitionStepQuery';

export const AssetJobPartitionsView: React.FC<{
  pipelineName: string;
  partitionSetName: string;
  repoAddress: RepoAddress;
}> = ({partitionSetName, repoAddress, pipelineName}) => {
  const {viewport, containerProps} = useViewport();
  const repositorySelector = repoAddressToSelector(repoAddress);

  const assetGraph = useAssetGraphData('', {
    pipelineSelector: {
      pipelineName,
      repositoryName: repoAddress.name,
      repositoryLocationName: repoAddress.location,
    },
  });

  const assetHealth = usePartitionHealthData(assetGraph.graphAssetKeys);

  const {total, missing, merged} = React.useMemo(() => {
    const merged = mergedAssetHealth(assetHealth.filter((h) => h.dimensions.length > 0));
    const ranges = merged.dimensions.map((d) => ({selected: d.partitionKeys, dimension: d}));
    const allKeys = explodePartitionKeysInRanges(ranges, merged.stateForKey);

    return {
      merged,
      total: allKeys.length,
      missing: allKeys.filter((p) => p.state === PartitionState.MISSING).length,
    };
  }, [assetHealth]);

  const [pageSize, setPageSize] = React.useState(60);
  const [offset, setOffset] = React.useState<number>(0);
  const [showAssets, setShowAssets] = React.useState(false);

  React.useEffect(() => {
    if (viewport.width) {
      // magical numbers to approximate the size of the window, which is calculated in the step
      // status component.  This approximation is to make sure that the window does not jump as
      // the pageSize gets recalculated
      const approxPageSize = getVisibleItemCount(viewport.width - GRID_FLOATING_CONTAINER_WIDTH);
      setPageSize(approxPageSize);
    }
  }, [viewport.width, setPageSize]);

  let dimensionIdx = merged.dimensions.findIndex(isTimeseriesDimension);
  if (dimensionIdx === -1) {
    dimensionIdx = 0; // may as well show something
  }

  const dimension = merged.dimensions[dimensionIdx];
  const dimensionKeys = dimension?.partitionKeys || [];

  const selectedDimensionKeys = dimensionKeys.slice(
    Math.max(0, dimensionKeys.length - 1 - offset - pageSize),
    dimensionKeys.length - offset,
  );
  return (
    <div>
      <Box
        flex={{justifyContent: 'space-between', direction: 'row', alignItems: 'center'}}
        border={{width: 1, side: 'bottom', color: Colors.KeylineGray}}
        padding={{vertical: 16, horizontal: 24}}
      >
        <Subheading>Status</Subheading>
        <Box flex={{gap: 8}}>
          <Button onClick={() => setShowAssets(!showAssets)}>
            {showAssets ? 'Hide per-asset status' : 'Show per-asset status'}
          </Button>
          <LaunchAssetExecutionButton
            scope={{all: assetGraph.graphQueryItems.map((g) => g.node), skipAllTerm: true}}
            preferredJobName={pipelineName}
          />
        </Box>
      </Box>
      <Box
        flex={{direction: 'row', alignItems: 'center'}}
        border={{width: 1, side: 'bottom', color: Colors.KeylineGray}}
        padding={{left: 8}}
      >
        <CountBox count={total} label="Total partitions" />
        <CountBox count={missing} label="Missing partitions" />
      </Box>
      <Box padding={{vertical: 16, horizontal: 24}}>
        <div {...containerProps}>
          <PartitionStatus
            partitionNames={dimensionKeys}
            splitPartitions={!isTimeseriesDimension(dimension)}
            partitionStateForKey={(key) => merged.stateForSingleDimension(dimensionIdx, key)}
            selected={selectedDimensionKeys}
            selectionWindowSize={pageSize}
            tooltipMessage="Click to view per-asset status"
            onClick={(partitionName) => {
              const maxIdx = dimensionKeys.length - 1;
              const selectedIdx = dimensionKeys.indexOf(partitionName);
              const nextOffset = Math.min(
                maxIdx,
                Math.max(0, maxIdx - selectedIdx - 0.5 * pageSize),
              );
              setOffset(nextOffset);
            }}
          />
        </div>
        {showAssets && dimension && (
          <Box margin={{top: 16}}>
            <PartitionPerAssetStatus
              rangeDimensionIdx={dimensionIdx}
              rangeDimension={dimension}
              assetHealth={assetHealth}
              assetQueryItems={assetGraph.graphQueryItems}
              pipelineName={pipelineName}
              setPageSize={setPageSize}
              offset={offset}
              setOffset={setOffset}
            />
          </Box>
        )}
      </Box>
      <AssetJobPartitionGraphs
        pipelineName={pipelineName}
        partitionSetName={partitionSetName}
        multidimensional={(merged?.dimensions.length || 0) > 1}
        dimensionName={dimension?.name}
        dimensionKeys={dimensionKeys}
        selected={selectedDimensionKeys}
        offset={offset}
        pageSize={pageSize}
      />
      <Box
        padding={{horizontal: 24, vertical: 16}}
        border={{side: 'horizontal', color: Colors.KeylineGray, width: 1}}
        style={{marginBottom: -1}}
      >
        <Subheading>Backfill history</Subheading>
      </Box>
      <Box margin={{bottom: 20}}>
        <JobBackfillsTable
          partitionSetName={partitionSetName}
          repositorySelector={repositorySelector}
          partitionNames={dimensionKeys}
          refetchCounter={1}
        />
      </Box>
    </div>
  );
};

export const AssetJobPartitionGraphs: React.FC<{
  pipelineName: string;
  partitionSetName: string;
  multidimensional: boolean;
  dimensionName: string;
  dimensionKeys: string[];
  selected: string[];
  pageSize: number;
  offset: number;
}> = ({
  dimensionKeys,
  dimensionName,
  selected,
  pageSize,
  partitionSetName,
  multidimensional,
  pipelineName,
  offset,
}) => {
  const partitions = usePartitionStepQuery(
    partitionSetName,
    multidimensional ? `${DagsterTag.Partition}/${dimensionName}` : DagsterTag.Partition,
    dimensionKeys,
    pageSize,
    [],
    pipelineName,
    offset,
    !dimensionName,
  );

  const {stepDurationData, runDurationData} = usePartitionDurations(partitions);

  return (
    <>
      <Box
        padding={{horizontal: 24, vertical: 16}}
        border={{side: 'horizontal', width: 1, color: Colors.KeylineGray}}
      >
        <Subheading>Run duration</Subheading>
      </Box>

      <Box margin={24}>
        <PartitionGraph
          isJob={true}
          title="Execution time by partition"
          yLabel="Execution time (secs)"
          partitionNames={selected}
          jobDataByPartition={runDurationData}
        />
      </Box>
      <Box
        padding={{horizontal: 24, vertical: 16}}
        border={{side: 'horizontal', width: 1, color: Colors.KeylineGray}}
      >
        <Subheading>Step durations</Subheading>
      </Box>
      <Box margin={24}>
        <PartitionGraph
          isJob={true}
          title="Execution time by partition"
          yLabel="Execution time (secs)"
          partitionNames={selected}
          stepDataByPartition={stepDurationData}
        />
      </Box>
    </>
  );
};
