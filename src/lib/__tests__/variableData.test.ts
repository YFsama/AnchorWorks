import { describe, expect, it } from 'vitest';
import {
  buildSerialValues,
  dedupeVariableListValues,
  estimateVariableDataGaps,
  getVariableDataGridPosition,
  parseVariableListValues,
  previewVariableDataValues,
  reverseVariableListValues,
  sortVariableListValues,
  summarizeVariableDataGrid,
} from '../variableData';

describe('variable data helpers', () => {
  it('builds clamped padded serial values', () => {
    expect(buildSerialValues(7, 2, 4, 3)).toEqual(['007', '009', '011', '013']);
    expect(buildSerialValues(1, 1, 2005, 0)).toHaveLength(2000);
  });

  it('estimates auto gaps from selected text bounds', () => {
    expect(estimateVariableDataGaps(75.59, 18.9)).toEqual({ gapX: 30, gapY: 15 });
    expect(estimateVariableDataGaps(0, 0)).toEqual({ gapX: 10, gapY: 10 });
    expect(estimateVariableDataGaps(0, 0, -20)).toEqual({ gapX: 5, gapY: 5 });
  });

  it('parses pasted comma and newline list values', () => {
    expect(parseVariableListValues(' Alice, Bob\n\nDoor 10 , Door 2 ')).toEqual(['Alice', 'Bob', 'Door 10', 'Door 2']);
  });

  it('dedupes pasted list values case-insensitively in first-seen order', () => {
    expect(dedupeVariableListValues(['Alice', 'bob', 'ALICE', 'Bob', 'Carla'])).toEqual(['Alice', 'bob', 'Carla']);
  });

  it('sorts list values naturally for door and ticket runs', () => {
    expect(sortVariableListValues(['Door 10', 'door 2', 'Door 1'])).toEqual(['Door 1', 'door 2', 'Door 10']);
  });

  it('reverses list values without mutating the original order', () => {
    const values = ['Ticket 1', 'Ticket 2', 'Ticket 3'];

    expect(reverseVariableListValues(values)).toEqual(['Ticket 3', 'Ticket 2', 'Ticket 1']);
    expect(values).toEqual(['Ticket 1', 'Ticket 2', 'Ticket 3']);
  });

  it('summarizes variable-data grid dimensions', () => {
    expect(summarizeVariableDataGrid(0, 5)).toEqual({ cols: 5, rows: 0, cells: 0 });
    expect(summarizeVariableDataGrid(11, 5)).toEqual({ cols: 5, rows: 3, cells: 11 });
  });

  it('maps variable-data grid positions by rows or columns', () => {
    expect(getVariableDataGridPosition(2, 8, 3, 'rows')).toEqual({ col: 2, row: 0 });
    expect(getVariableDataGridPosition(2, 8, 3, 'columns')).toEqual({ col: 0, row: 2 });
    expect(getVariableDataGridPosition(3, 8, 3, 'columns')).toEqual({ col: 1, row: 0 });
  });

  it('previews generated values with overflow count', () => {
    expect(previewVariableDataValues(['001', '002', '003', '004', '005', '006'])).toEqual({
      values: ['001', '002', '003', '004', '005'],
      total: 6,
      hidden: 1,
    });
  });
});
