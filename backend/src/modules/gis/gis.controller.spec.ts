import { Test, TestingModule } from '@nestjs/testing';
import { GisController } from './gis.controller';

describe('GisController', () => {
  let controller: GisController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [GisController],
    }).compile();

    controller = module.get<GisController>(GisController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
