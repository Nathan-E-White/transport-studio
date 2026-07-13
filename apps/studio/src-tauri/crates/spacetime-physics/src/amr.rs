//! AMR-aware identity and field access for the first single-block kernel slice.
//!
//! This adapter deliberately exposes one level-zero Cartesian block backed by `UniformGrid3`.
//! It does not implement a block hierarchy, subcycling, regridding, prolongation, restriction,
//! refluxing, or curvilinear charts; those remain deferred tracks in the architecture ledger.

use crate::{GridField3, PhysicsError, UniformGrid3};

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct AmrBlockId(u32);

impl AmrBlockId {
    pub const ROOT: Self = Self(0);

    pub const fn new(value: u32) -> Self {
        Self(value)
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct RefinementLevel(u32);

impl RefinementLevel {
    pub const ROOT: Self = Self(0);
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct AmrBlockDescriptor {
    pub id: AmrBlockId,
    pub level: RefinementLevel,
    pub parent: Option<AmrBlockId>,
    pub grid: UniformGrid3,
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, Hash)]
pub struct BlockCellIndex {
    pub block: AmrBlockId,
    pub ijk: [usize; 3],
}

impl BlockCellIndex {
    pub const fn new(block: AmrBlockId, ijk: [usize; 3]) -> Self {
        Self { block, ijk }
    }
}

#[derive(Debug, Copy, Clone, PartialEq, Eq, thiserror::Error)]
pub enum AmrAdapterError {
    #[error("single-block adapter does not contain block {requested:?}")]
    UnsupportedBlock { requested: AmrBlockId },
    #[error("field grid does not match the single AMR block")]
    FieldGridMismatch,
    #[error(transparent)]
    Grid(#[from] PhysicsError),
}

#[derive(Debug, Copy, Clone, PartialEq)]
pub struct SingleBlockAmrAdapter {
    root: AmrBlockDescriptor,
}

impl SingleBlockAmrAdapter {
    pub fn try_new(grid: UniformGrid3) -> Result<Self, AmrAdapterError> {
        grid.cell_count()?;
        Ok(Self {
            root: AmrBlockDescriptor {
                id: AmrBlockId::ROOT,
                level: RefinementLevel::ROOT,
                parent: None,
                grid,
            },
        })
    }

    pub const fn root_block(&self) -> AmrBlockDescriptor {
        self.root
    }

    pub fn linear_index(&self, cell: BlockCellIndex) -> Result<usize, AmrAdapterError> {
        self.ensure_root(cell.block)?;
        Ok(self
            .root
            .grid
            .linear_index(cell.ijk[0], cell.ijk[1], cell.ijk[2])?)
    }

    pub fn cell_for_index(&self, index: usize) -> Result<BlockCellIndex, AmrAdapterError> {
        Ok(BlockCellIndex::new(
            AmrBlockId::ROOT,
            self.root.grid.ijk_for_index(index)?,
        ))
    }

    pub fn get<'a, T>(
        &self,
        field: &'a GridField3<T>,
        cell: BlockCellIndex,
    ) -> Result<&'a T, AmrAdapterError> {
        self.ensure_field_grid(field.grid)?;
        Ok(field.get_index(self.linear_index(cell)?)?)
    }

    pub fn get_mut<'a, T>(
        &self,
        field: &'a mut GridField3<T>,
        cell: BlockCellIndex,
    ) -> Result<&'a mut T, AmrAdapterError> {
        self.ensure_field_grid(field.grid)?;
        Ok(field.get_index_mut(self.linear_index(cell)?)?)
    }

    fn ensure_root(&self, block: AmrBlockId) -> Result<(), AmrAdapterError> {
        if block != self.root.id {
            return Err(AmrAdapterError::UnsupportedBlock { requested: block });
        }
        Ok(())
    }

    fn ensure_field_grid(&self, grid: UniformGrid3) -> Result<(), AmrAdapterError> {
        if grid != self.root.grid {
            return Err(AmrAdapterError::FieldGridMismatch);
        }
        Ok(())
    }
}
