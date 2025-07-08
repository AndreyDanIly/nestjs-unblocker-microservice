import { IsBoolean, IsNotEmpty, IsUrl } from 'class-validator';

export class UnblockRequestDto {
  @IsUrl({}, { message: 'A valid URL must be provided.' })
  @IsNotEmpty()
  url: string;

  // NOTE: Required by the spec, but 'false' wasn't explained to me
  // so the service "assumes" that rendering is true.
  @IsBoolean()
  render: boolean;
}