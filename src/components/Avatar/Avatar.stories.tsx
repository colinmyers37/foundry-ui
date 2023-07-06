import * as React from 'react';
import { Story, Meta } from '@storybook/react';
import { withFoundryContext } from '../../../.storybook/decorators';

import Avatar, { AvatarProps } from './Avatar';

export const DefaultAvatar: Story<AvatarProps> = (args: AvatarProps) => <Avatar {...args} />;
DefaultAvatar.args = {
  name: 'John Smith',
  imgURL:
    'https://encrypted-tbn0.gstatic.com/images?q=tbn:ANd9GcSHCWDau1lAskHdiokbaocBqIXOCxWcdlAwg9UhusQHaALmDwbfaDxGpjmn7Cv0HWXYxTI&usqp=CAU',
  size: 3,
  borderRadiusPercent: 50,
  isLoading: false,
  isError: false,
};

export default {
  title: 'Avatar',
  component: Avatar,
  decorators: [withFoundryContext],
  argTypes: {
    borderRadiusPercent: { control: { type: 'range', min: 0, max: 50, step: 1 } },
  },
} as Meta;
